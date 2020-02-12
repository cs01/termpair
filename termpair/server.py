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
from typing import Any, Dict, List, NamedTuple, NewType, Optional

import starlette  # type: ignore
from fastapi import FastAPI  # type: ignore
from starlette.staticfiles import StaticFiles  # type: ignore
from starlette.websockets import WebSocket  # type: ignore

from .utils import get_random_string


PUBLIC_DIR = os.path.join(os.path.dirname(os.path.realpath(__file__)), "frontend_build")
STATIC_DIR = os.path.join(
    os.path.dirname(os.path.realpath(__file__)), "frontend_build/static"
)

app = FastAPI()


class Terminal(NamedTuple):
    ws: WebSocket
    rows: int
    cols: int
    web_clients: List[WebSocket]
    allow_browser_control: bool
    command: str
    broadcast_start_time_iso: str


TerminalId = NewType("TerminalId", str)

terminals: Dict[TerminalId, Terminal] = {}


@app.get("/terminal/{terminal_id}")
async def index(terminal_id: Optional[TerminalId] = None):
    from .main import __version__

    terminal = None
    if terminal_id:
        terminal = terminals.get(terminal_id)

    data: Dict[str, Any]

    print(terminal, "!!")
    if terminal:
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
    else:
        data = dict(termpair_version=__version__)
    return data


@app.websocket("/connect_browser_to_terminal")
async def connect_browser_to_terminal(ws: WebSocket):
    await ws.accept()
    terminal_id = ws.query_params.get("terminal_id", None)
    terminal = terminals.get(terminal_id)
    if not terminal:
        print(f"terminal id {terminal_id} not found")
        await ws.close()
        return

    terminal.web_clients.append(ws)
    num_browsers = len(terminal.web_clients)
    try:
        # update connected browser count in each browser
        for browser in terminal.web_clients:
            await browser.send_json({"event": "num_clients", "payload": num_browsers})
        # read any input from the browser that just connected
        while True:
            encrypted_browser_input = await ws.receive_text()
            if terminal.allow_browser_control:
                # Got input, send it to the single terminal that's broadcasting.
                await terminal.ws.send_json(
                    {"event": "command", "payload": encrypted_browser_input}
                )
    except starlette.websockets.WebSocketDisconnect:
        # this can happen when the broadcasting terminal disconnects
        # and the task reading data from the terminal closes
        # all connected browser websockets
        pass
    finally:
        terminal.web_clients.remove(ws)
        num_browsers = len(terminal.web_clients)
        for web_client in terminal.web_clients:
            await web_client.send_json(
                {"event": "num_clients", "payload": num_browsers}
            )


async def _task_forward_terminal_data_to_web_clients(terminal: Terminal):
    while True:
        # The task is to endlessly wait for new data from the terminal,
        # read it, and broadcast it to all connected browsers
        ws = terminal.ws
        web_clients = terminal.web_clients
        try:
            data = await ws.receive_json()
        except starlette.websockets.WebSocketDisconnect:
            # Terminal stopped broadcasting
            for web_client in web_clients:
                # close each browser connection
                await web_client.close()
            # task is done
            return

        if data.get("event") == "new_output":
            terminal_data = data.get("payload")
        elif data.get("event") == "resize":
            # namedtuples require you to replace fields
            terminal._replace(rows=data["payload"]["rows"])
            terminal._replace(cols=data["payload"]["cols"])
        else:
            logging.warning(f"Got unknown event {data.get('event', 'none')}")

        if not terminal_data:
            # terminal outputs an empty string when it closes, so it just closed
            for web_client in web_clients:
                # close each browser connection since the terminal's broadcasting
                # process stopped
                await web_client.close()
            # task is done
            return

        clients_to_remove: List[WebSocket] = []
        for web_client in web_clients:
            try:
                await web_client.send_json(data)
            except Exception:
                if web_client not in clients_to_remove:
                    clients_to_remove.append(web_client)

        if clients_to_remove:
            for client in clients_to_remove:
                web_clients.remove(client)

            for web_client in web_clients:
                await web_client.send_json(
                    {"event": "num_clients", "payload": len(web_clients)}
                )
        # continue running task in while loop


def _gen_terminal_id(ws: WebSocket) -> TerminalId:
    random = str(str(time.time()) + get_random_string(30))
    checksum = md5(random.encode())
    return TerminalId(checksum.hexdigest())


@app.websocket("/connect_to_terminal")
async def connect_to_terminal(ws: WebSocket):
    await ws.accept()
    try:
        terminal_id = _gen_terminal_id(ws)
        data = await ws.receive_json()
        terminal = Terminal(
            ws=ws,
            web_clients=[],
            rows=data["rows"],
            cols=data["cols"],
            allow_browser_control=data["allow_browser_control"],
            command=data["command"],
            broadcast_start_time_iso=data["broadcast_start_time_iso"],
        )
        terminals[terminal_id] = terminal

        # send back to the terminal that the broadcast is starting under
        # this id
        await ws.send_text(
            json.dumps({"event": "start_broadcast", "payload": terminal_id})
        )

        # start a task that forwards all data from the terminal to browsers
        task = asyncio.ensure_future(
            _task_forward_terminal_data_to_web_clients(terminal)
        )
        done, pending = await (
            asyncio.wait([task], return_when=asyncio.FIRST_COMPLETED)
        )
        for task in pending:
            task.cancel()
    finally:
        terminals.pop(terminal_id, None)


app.mount("/", StaticFiles(directory=PUBLIC_DIR, html=True))
app.mount("/static", StaticFiles(directory=STATIC_DIR, html=True))
