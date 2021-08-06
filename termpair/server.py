"""
Server to receive all output from user's terminal and forward on to any
browsers that are watching the broadcast
"""


import asyncio
import json
import logging
import os
import time
from hashlib import md5
from typing import Any, Dict, List, Optional

import starlette  # type: ignore
from fastapi import FastAPI  # type: ignore
from starlette.staticfiles import StaticFiles  # type: ignore
from starlette.websockets import WebSocket  # type: ignore
from fastapi.middleware.cors import CORSMiddleware  # type:ignore

from .Terminal import Terminal, TerminalId
from .utils import get_random_string
from .constants import TERMPAIR_VERSION
from .server_websocket_subprotocol_handlers import (
    handle_ws_message_subprotocol_v3,
)
from fastapi.exceptions import HTTPException  # type: ignore


PUBLIC_DIR = os.path.join(os.path.dirname(os.path.realpath(__file__)), "frontend_build")
STATIC_DIR = os.path.join(
    os.path.dirname(os.path.realpath(__file__)), "frontend_build/static"
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

terminals: Dict[TerminalId, Terminal] = {}


@app.get("/ping")
async def ping():
    return "pong"


@app.get("/terminal/{terminal_id}")
async def index(terminal_id: Optional[TerminalId] = None):
    from .main import __version__

    terminal = None
    if terminal_id:
        terminal = terminals.get(terminal_id)

    data: Dict[str, Any]

    if not terminal:
        raise HTTPException(status_code=404, detail="Terminal not found")

    rows = terminal.rows
    cols = terminal.cols
    allow_browser_control = terminal.allow_browser_control
    data = dict(
        terminal_id=terminal_id,
        cols=cols,
        rows=rows,
        allow_browser_control=allow_browser_control,
        command=terminal.command,
        broadcast_start_time_iso=terminal.broadcast_start_time_iso,
        termpair_version=__version__,
    )
    return data


@app.websocket("/connect_browser_to_terminal")
async def connect_browser_to_terminal(ws: WebSocket):
    terminal_id = ws.query_params.get("terminal_id", None)
    terminal = terminals.get(terminal_id)
    if not terminal:
        print(f"terminal id {terminal_id} not found")
        await ws.close()
        return
    await ws.accept()

    terminal.browser_websockets.append(ws)

    # Need to create a task so it can be cancelled by the terminal's
    # task if the terminal session ends. That way, browsers are notified
    # the session ended instead of thinking the connection is still open
    # (an exception raised while awaiting)
    task: asyncio.Task = asyncio.create_task(
        _task_handle_browser_websocket(terminal, ws)
    )

    def remove_task_from_terminal_list(future):
        # task will sit in list as "done"
        # not a big deal if it sits there, but we'll remove it
        # immediately since it's never going to be used again
        terminal.browser_tasks.remove(task)

    task.add_done_callback(remove_task_from_terminal_list)
    terminal.browser_tasks.append(task)
    try:
        # task will be cancelled when terminal session the client started ends
        await task
    except asyncio.exceptions.CancelledError:
        pass


async def _task_handle_browser_websocket(terminal: Terminal, ws: WebSocket):
    try:
        # update connected browser count in each browser
        num_browsers = len(terminal.browser_websockets)
        for browser in terminal.browser_websockets:
            await browser.send_json({"event": "num_clients", "payload": num_browsers})
        while True:
            await handle_ws_message_subprotocol_v3(ws, terminal)

    except starlette.websockets.WebSocketDisconnect:
        # browser closed the connection
        pass
    finally:
        if ws in terminal.browser_websockets:
            terminal.browser_websockets.remove(ws)
        num_browsers = len(terminal.browser_websockets)
        for web_client in terminal.browser_websockets:
            await web_client.send_json(
                {"event": "num_clients", "payload": num_browsers}
            )


async def forward_terminal_data_to_web_clients(terminal: Terminal):
    while True:
        # The task is to endlessly wait for new data from the terminal,
        # read it, and broadcast it to all connected browsers
        ws = terminal.ws
        browser_websockets = terminal.browser_websockets
        try:
            data = await ws.receive_json()
        except starlette.websockets.WebSocketDisconnect:
            # Terminal stopped broadcasting, close
            # all browser websocket tasks so they are notified
            # the connection has actually ended
            for task in terminal.browser_tasks:
                task.cancel()
            return

        terminal_has_closed = False
        event = data.get("event")
        if event == "new_output":
            terminal_data = data.get("payload")
            terminal_has_closed = not terminal_data
        elif event == "resize":
            # namedtuples require you to replace fields
            terminal._replace(rows=data["payload"]["rows"])
            terminal._replace(cols=data["payload"]["cols"])
        elif event in ["aes_keys", "aes_key_rotation"]:
            pass
        else:
            logging.warning(f"Got unknown event {data.get('event', 'none')}")

        if terminal_has_closed:
            # terminal outputs an empty string when it closes, so it just closed
            for browser_ws in browser_websockets:
                # close each browser connection since the terminal's broadcasting
                # process stopped
                await browser_ws.close()
            return

        browsers_to_remove: List[WebSocket] = []
        for browser_ws in browser_websockets:
            try:
                await browser_ws.send_json(data)
            except Exception:
                if browser_ws not in browsers_to_remove:
                    browsers_to_remove.append(browser_ws)

        if browsers_to_remove:
            for browser_ws in browsers_to_remove:
                browser_websockets.remove(browser_ws)

            # let still-connected clients know the new count
            for browser_ws in browser_websockets:
                await browser_ws.send_json(
                    {"event": "num_clients", "payload": len(browser_websockets)}
                )
        # continue running task in while loop


def _gen_terminal_id(ws: WebSocket) -> TerminalId:
    random = str(str(time.time()) + get_random_string(30))
    checksum = md5(random.encode())
    return TerminalId(checksum.hexdigest())


@app.websocket("/connect_to_terminal")
async def connect_to_terminal(ws: WebSocket):
    await ws.accept()
    data = await ws.receive_json()
    subprotocol_version = data.get("subprotocol_version")
    valid_subprotocols = ["3"]
    if subprotocol_version not in valid_subprotocols:
        await ws.send_text(
            json.dumps(
                {
                    "event": "fatal_error",
                    "payload": "Client and server are running incompatible versions. "
                    + f"Server is running v{TERMPAIR_VERSION}. "
                    + "Ensure you are using a version of the TermPair client compatible with the server. ",
                }
            )
        )
        await ws.close()
        return

    terminal_id = _gen_terminal_id(ws)
    terminal = Terminal(
        ws=ws,
        browser_websockets=[],
        browser_tasks=[],
        rows=data["rows"],
        cols=data["cols"],
        allow_browser_control=data["allow_browser_control"],
        command=data["command"],
        broadcast_start_time_iso=data["broadcast_start_time_iso"],
        subprotocol_version=subprotocol_version,
    )
    terminals[terminal_id] = terminal

    # send back to the terminal that the broadcast is starting under
    # this id
    await ws.send_text(json.dumps({"event": "start_broadcast", "payload": terminal_id}))

    # forwards all data from the terminal to browsers for as long as the
    # client is connected
    await asyncio.ensure_future(forward_terminal_data_to_web_clients(terminal))
    terminals.pop(terminal_id, None)


app.mount("/", StaticFiles(directory=PUBLIC_DIR, html=True))
app.mount("/static", StaticFiles(directory=STATIC_DIR, html=True))
