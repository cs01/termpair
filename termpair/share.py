#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The local terminal is replaced with a pty spawned in this code. All input and output
to the terminal is routed through here, and recorded to a transcript file.
"""

import asyncio
import os
import pty
import json
import base64
import shlex
import signal
import sys
import textwrap
from typing import List
import websockets
import webbrowser
from . import utils
import ssl
import datetime


max_read_bytes = 1024 * 2
ws_queue: asyncio.Queue = asyncio.Queue()


def _print_warning(
    url: str, cmd: List[str], allow_browser_control: bool, session_id: str
):

    cmd_str = " ".join(shlex.quote(c) for c in cmd)
    if allow_browser_control:
        warning = "WARNING: Your terminal is viewable AND controllable from"
    else:
        warning = "WARNING: Your terminal is viewable but NOT controllable from"

    if url.startswith("https://"):
        secure = "Your connection is secure."
    else:
        secure = "WARNING: Your connection NOT secure."

    print(
        textwrap.dedent(
            f"""
        Sharing all input and output of `{cmd_str}`.

        {warning}

        {url}
        {secure}

        Type 'exit' to stop sharing.

        When you are no longer sharing, you will see the session id '{session_id}' printed.
        This id is not shared with the server or any connected browsers.
        """
        )
    )


def _get_share_url(url, ws_id):
    return f"{url}/?id={ws_id}"


async def _forward_pty_queue(ws):
    """Waits for new pty output (nonblocking), then immediately sends to server"""
    while True:
        data = await ws_queue.get()
        await ws.send(data)


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
        payload = base64.b64encode(pty_output)
        # data = pty_output.decode()
        # add output to queue to be sent to server
        ws_queue.put_nowait(
            json.dumps({"event": "new_output", "payload": payload.decode()})
        )
    else:
        cleanup()
        return


async def _recv(ws):
    data = await ws.recv()
    parsed = json.loads(data)
    return parsed["event"], parsed["payload"]


async def broadcastterminal(
    cmd: List[str], url: str, allow_browser_control: bool, open_browser: bool
):
    # create child process attached to a pty we can read from and write to
    (child_pid, pty_fd) = pty.fork()
    if child_pid == 0:
        os.execvpe(cmd[0], cmd, os.environ)
        return

    stdin_fd = sys.stdin.fileno()
    stdout_fd = sys.stdout.fileno()

    utils.copy_terminal_dimensions(stdin_fd, pty_fd)

    if url.startswith("https"):
        ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS)
    else:
        ssl_context = None
    ws_url = url.replace("http", "ws")

    async with websockets.connect(
        f"{ws_url}/connect_to_terminal", ssl=ssl_context
    ) as ws:
        rows, cols = utils.get_terminal_size(stdin_fd)
        cmd_str = " ".join(cmd)
        broadcast_start_time_iso = datetime.datetime.now(
            datetime.timezone.utc
        ).isoformat()
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
        _, ws_id = await _recv(ws)
        url = _get_share_url(url, ws_id)
        session_id = utils.get_random_string(12)
        _print_warning(url, cmd, allow_browser_control, session_id)

        with utils.make_raw(stdin_fd):
            await _do_broadcast(pty_fd, stdin_fd, stdout_fd, ws, url, open_browser)

        print(f"You are no longer broadcasting session id {session_id}")


async def _do_broadcast(
    pty_fd: int, stdin_fd: int, stdout_fd: int, ws, url: str, open_browser: bool
):
    def _on_resize(signum, frame):
        utils.copy_terminal_dimensions(stdin_fd, pty_fd)
        rows, cols = utils.get_terminal_size(stdin_fd)
        ws_queue.put_nowait(
            json.dumps({"event": "resize", "payload": {"rows": rows, "cols": cols}})
        )

    signal.signal(signal.SIGWINCH, _on_resize)
    if open_browser:
        webbrowser.open(url)

    tasks = [
        asyncio.ensure_future(_forward_pty_queue(ws)),
        asyncio.ensure_future(_take_commands_from_websocket(pty_fd, ws)),
    ]

    loop = asyncio.get_event_loop()

    def cleanup():
        for t in tasks:
            t.cancel()
            loop.remove_reader(stdin_fd)
            loop.remove_reader(pty_fd)

    # add event-based reading for file on file descriptors
    loop.add_reader(stdin_fd, _handle_new_stdin, stdin_fd, pty_fd)
    loop.add_reader(pty_fd, _handle_new_pty_output, ws, pty_fd, stdout_fd, cleanup)

    done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    for task in pending:
        task.cancel()


async def _take_commands_from_websocket(fd, ws):
    """receives commands from websocket and writes them to associated fd"""
    try:
        while True:
            event, payload = await _recv(ws)
            if event == "command":
                output = payload
            else:
                pass
            os.write(fd, output.encode())
    except websockets.exceptions.ConnectionClosed:
        pass
