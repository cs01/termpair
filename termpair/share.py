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
import textwrap
import webbrowser
from typing import List, Optional

import websockets

from . import utils


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
        Running {cmd_str!r} and sharing to {url!r}.
        Type 'exit' or close terminal to stop sharing.
        {dashes}"""
        )
    )


def _get_share_url(url, ws_id):
    return f"{url}/?terminal_id={ws_id}"


def _handle_new_stdin(stdin_fd: int, pty_fd: int):
    """forwards from terminal's stdin to the pty's stdin"""
    user_input = os.read(stdin_fd, max_read_bytes)
    os.write(pty_fd, user_input)


def _handle_new_pty_output(ws, pty_fd: int, stdout_fd: int, cleanup):
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
        payload = base64.b64encode(pty_output)
        ws_queue.put_nowait(
            json.dumps({"event": "new_output", "payload": payload.decode()})
        )
    else:
        cleanup()
        return


async def _receive_data_from_websocket(ws):
    data = await ws.recv()
    parsed = json.loads(data)
    return parsed["event"], parsed["payload"]


async def _initialize_broadcast(
    cmd, url, ws, stdin_fd, pty_fd, allow_browser_control
) -> str:
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
            }
        )
    )
    _, ws_id = await _receive_data_from_websocket(ws)
    share_url = _get_share_url(url, ws_id)
    _print_broadcast_init_message(share_url, cmd)
    return ws_id


async def _do_broadcast(
    pty_fd: int,
    stdin_fd: int,
    stdout_fd: int,
    ws,
    share_url: str,
    open_browser: bool,
    allow_browser_control: bool,
):
    """forward pty i/o to/from file descriptors and websockets"""

    def _on_resize(signum, frame):
        utils.copy_terminal_dimensions(stdin_fd, pty_fd)
        rows, cols = utils.get_terminal_size(stdin_fd)
        ws_queue.put_nowait(
            json.dumps({"event": "resize", "payload": {"rows": rows, "cols": cols}})
        )

    signal.signal(signal.SIGWINCH, _on_resize)
    if open_browser:
        webbrowser.open(share_url)

    tasks = [
        asyncio.ensure_future(_task_send_ws_queue_to_server(ws)),
    ]
    if allow_browser_control:
        tasks.append(asyncio.ensure_future(_task_receive_server_pty_input(pty_fd, ws)))

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
    loop.add_reader(pty_fd, _handle_new_pty_output, ws, pty_fd, stdout_fd, cleanup)

    done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    for task in pending:
        task.cancel()


async def _task_receive_server_pty_input(fd, ws):
    """receives commands from websocket and writes them to associated fd"""
    try:
        while True:
            event, payload = await _receive_data_from_websocket(ws)
            if event == "command":
                os.write(fd, payload.encode())
            else:
                print(f"Got unhandled event {event}")
    except websockets.exceptions.ConnectionClosed:
        return


async def broadcast_terminal(
    cmd: List[str], url: str, allow_browser_control: bool, open_browser: bool
):
    """For this process and connect it to websocket to broadcast it"""
    # create child process attached to a pty we can read from and write to
    (child_pid, pty_fd) = pty.fork()
    if child_pid == 0:
        # This is the forked process. Replace it with the shell command
        # the user wants to run.
        os.execvpe(cmd[0], cmd, os.environ)
        return

    stdin_fd = sys.stdin.fileno()
    stdout_fd = sys.stdout.fileno()

    ssl_context: Optional[ssl.SSLContext] = ssl.SSLContext(
        ssl.PROTOCOL_TLS
    ) if url.startswith("https") else None
    ws_url = url.replace("http", "ws")

    session_id = utils.get_random_string(12)

    async with websockets.connect(
        f"{ws_url}/connect_to_terminal", ssl=ssl_context
    ) as ws:
        ws_id = await _initialize_broadcast(
            cmd, url, ws, stdin_fd, pty_fd, allow_browser_control
        )
        with utils.make_raw(stdin_fd):
            await _do_broadcast(
                pty_fd,
                stdin_fd,
                stdout_fd,
                ws,
                _get_share_url(url, ws_id),
                open_browser,
                allow_browser_control,
            )
        print(f"You are no longer broadcasting session id {session_id}")
