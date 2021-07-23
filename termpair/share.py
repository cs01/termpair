"""
Establish a websocket connection and replace local terminal with a pty
that sends all output to the server.
"""

import asyncio
import base64
import datetime
import json
import os
import pty
import shlex
import signal
import ssl
import sys
from urllib.parse import urljoin
import textwrap
import webbrowser
from typing import List, Optional, Callable

import websockets  # type: ignore

from .Terminal import TerminalId
from .constants import subprotocol_version, TermPairError
from . import utils
from . import encryption

max_read_bytes = 1024 * 2
ws_queue: asyncio.Queue = asyncio.Queue()


async def _task_send_ws_queue_to_server(ws):
    """Waits for new pty output (nonblocking), then immediately sends to server"""
    while True:
        data = await ws_queue.get()
        await ws.send(data)


def _print_broadcast_init_message(url: str, cmd: List[str]):
    cmd_str = " ".join(shlex.quote(c) for c in cmd)
    _, cols = utils.get_terminal_size(sys.stdin)
    dashes = "-" * cols
    print(
        textwrap.dedent(
            f"""        {dashes}
        \033[1m\033[0;32mConnection established with end-to-end encryption\033[0m 🔒
        Sharing {cmd_str!r} at

        {url}

        Type 'exit' or close terminal to stop sharing.
        {dashes}"""
        )
    )


def _get_share_url(url, ws_id, secret_key: bytes):
    secret_key_b64 = base64.b64encode(secret_key).decode()
    return urljoin(url, f"?terminal_id={ws_id}#{secret_key_b64}")


def _handle_new_stdin(stdin_fd: int, pty_fd: int):
    """forwards from terminal's stdin to the pty's stdin"""
    user_input = os.read(stdin_fd, max_read_bytes)
    os.write(pty_fd, user_input)


def _handle_new_pty_output(
    ws, pty_fd: int, stdout_fd: int, cleanup: Callable, secret_key: bytes
):
    """forwards pty's output to local stdout AND to websocket"""
    try:
        pty_output = os.read(pty_fd, max_read_bytes)
    except OSError:
        cleanup()
        return

    if pty_output:
        # forward output to user's terminal
        os.write(stdout_fd, pty_output)

        # also forward output to the server so it can forward to connected browsers
        encrypted_payload = encryption.encrypt(secret_key, pty_output)

        # TODO send as binary
        encrypted_base64_payload = base64.b64encode(encrypted_payload).decode()
        ws_queue.put_nowait(
            json.dumps({"event": "new_output", "payload": encrypted_base64_payload})
        )
    else:
        cleanup()
        return


async def _receive_data_from_websocket(ws):
    data = await ws.recv()
    parsed = json.loads(data)
    return parsed["event"], parsed.get("payload")


async def _initialize_broadcast(
    cmd, url, ws, stdin_fd, pty_fd, allow_browser_control, secret_key: bytes
) -> TerminalId:
    """Prepare server to store i/o about this terminal"""
    # copy our terminal dimensions to the pty so its row/col count
    # matches and we don't get unexpected line breaks/misalignments
    utils.copy_terminal_dimensions(stdin_fd, pty_fd)

    rows, cols = utils.get_terminal_size(stdin_fd)

    cmd_str = " ".join(cmd)
    broadcast_start_time_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    await ws.send(
        json.dumps(
            {
                "rows": rows,
                "cols": cols,
                "allow_browser_control": allow_browser_control,
                "command": cmd_str,
                "broadcast_start_time_iso": broadcast_start_time_iso,
                "subprotocol_version": subprotocol_version,
            }
        )
    )
    event, payload = await _receive_data_from_websocket(ws)
    if event == "start_broadcast":
        terminal_id = payload
        share_url = _get_share_url(url, terminal_id, secret_key)
        _print_broadcast_init_message(share_url, cmd)
        return terminal_id
    elif event == "fatal_error":
        raise TermPairError(fatal_server_error_msg(payload))
    else:
        raise TermPairError(
            "Unexpected event type received when starting broadcast. "
            + "Ensure you are using a compatible version with the server.",
            event,
        )


def emit_terminal_dimensions(stdin_fd, pty_fd):
    utils.copy_terminal_dimensions(stdin_fd, pty_fd)
    rows, cols = utils.get_terminal_size(stdin_fd)
    ws_queue.put_nowait(
        json.dumps({"event": "resize", "payload": {"rows": rows, "cols": cols}})
    )


async def _do_broadcast(
    pty_fd: int,
    stdin_fd: int,
    stdout_fd: int,
    ws,
    share_url: str,
    open_browser: bool,
    allow_browser_control: bool,
    secret_key: bytes,
):
    """forward pty i/o to/from file descriptors and websockets"""

    def on_terminal_resize(signum, frame):
        emit_terminal_dimensions(stdin_fd, pty_fd)

    signal.signal(signal.SIGWINCH, on_terminal_resize)
    if open_browser:
        webbrowser.open(share_url)

    tasks = [
        asyncio.ensure_future(_task_send_ws_queue_to_server(ws)),
    ]
    tasks.append(
        asyncio.ensure_future(
            _task_receive_websocket_messages(
                pty_fd, ws, secret_key, stdin_fd, allow_browser_control
            )
        )
    )

    loop = asyncio.get_event_loop()

    def cleanup():
        for t in tasks:
            t.cancel()
            loop.remove_reader(stdin_fd)
            loop.remove_reader(pty_fd)

    # add event-based reading of input to stdin, and forward to the pty
    # process
    loop.add_reader(stdin_fd, _handle_new_stdin, stdin_fd, pty_fd)
    # add event based reading of output from the pty and write to
    # stdout and to the server
    loop.add_reader(
        pty_fd, _handle_new_pty_output, ws, pty_fd, stdout_fd, cleanup, secret_key
    )

    done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    for task in pending:
        task.cancel()


def fatal_server_error_msg(error_msg: str):
    raise TermPairError("Connection was terminated with a fatal error: " + error_msg)


async def _task_receive_websocket_messages(
    pty_fd: int, ws, secret_key: bytes, stdin_fd: int, allow_browser_control: bool
):
    """receives events+payloads from browser websocket connection"""
    try:
        while True:
            event, payload = await _receive_data_from_websocket(ws)

            if event == "command":
                if allow_browser_control:
                    try:
                        encrypted_payload = base64.b64decode(payload)
                        data_to_write = encryption.decrypt(
                            secret_key, encrypted_payload
                        )
                        os.write(pty_fd, data_to_write.encode())
                    except Exception:
                        # TODO log error to a file
                        pass
            elif event == "request_terminal_dimensions":
                emit_terminal_dimensions(stdin_fd, pty_fd)
            elif event == "fatal_error":
                raise fatal_server_error_msg(payload)
            else:
                # TODO log to a file
                pass
    except websockets.exceptions.ConnectionClosed:
        return


async def broadcast_terminal(
    cmd: List[str], url: str, allow_browser_control: bool, open_browser: bool
):
    """Fork this process and connect it to websocket to broadcast it"""
    # create child process attached to a pty we can read from and write to
    session_id = utils.get_random_string(12)

    (child_pid, pty_fd) = pty.fork()
    if child_pid == 0:
        # This is the forked process. Replace it with the shell command
        # the user wants to run.
        env = os.environ.copy()
        env["TERMPAIR_BROADCASTING"] = "1"
        env["TERMPAIR_SESSION_ID"] = session_id
        env["TERMPAIR_BROWSERS_CAN_CONTROL"] = "1" if allow_browser_control else "0"
        os.execvpe(cmd[0], cmd, env)
        return

    stdin_fd = sys.stdin.fileno()
    stdout_fd = sys.stdout.fileno()

    ssl_context: Optional[ssl.SSLContext] = (
        ssl.SSLContext(ssl.PROTOCOL_TLS) if url.startswith("https") else None
    )

    ws_url = url.replace("http", "ws")

    ws_endpoint = urljoin(
        ws_url, f"connect_to_terminal?subprotocol_version={subprotocol_version}"
    )
    try:
        async with websockets.connect(ws_endpoint, ssl=ssl_context) as ws:
            secret_key = encryption.gen_key()
            terminal_id = await _initialize_broadcast(
                cmd, url, ws, stdin_fd, pty_fd, allow_browser_control, secret_key
            )
            with utils.make_raw(stdin_fd):
                await _do_broadcast(
                    pty_fd,
                    stdin_fd,
                    stdout_fd,
                    ws,
                    _get_share_url(url, terminal_id, secret_key),
                    open_browser,
                    allow_browser_control,
                    secret_key,
                )
            print(f"You are no longer broadcasting session id {session_id}")
    except ConnectionRefusedError as e:
        raise TermPairError(
            "Connection was refused. Is the TermPair server running on the host and port specified? "
            + str(e),
        )
