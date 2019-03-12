#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Server to receive all output from user's terminal and forward on to any
browsers that are watching the broadcast
"""


from bocadillo import App, WebSocket, Templates
import asyncio
import os
import json
from typing import NamedTuple, Set, Dict, NewType
import starlette
from hashlib import md5
import traceback
import logging
import datetime
import time
from .utils import get_random_string

TEMPLATES_DIR = os.path.join(
    os.path.dirname(os.path.realpath(__file__)), "frontend_build"
)
STATIC_DIR = os.path.join(
    os.path.dirname(os.path.realpath(__file__)), "frontend_build/static"
)
app = App(static_dir=STATIC_DIR)
templates = Templates(app, directory=TEMPLATES_DIR)


class Terminal(NamedTuple):
    ws: WebSocket
    rows: int
    cols: int
    web_clients: Set[WebSocket]
    allow_browser_control: bool
    command: str
    broadcast_start_time_iso: str


TerminalId = NewType("TerminalId", str)

terminals: Dict[TerminalId, Terminal] = {}


@app.route("/")
async def index(req, res):
    terminal_id = req.query_params.get("id")
    terminal = terminals.get(terminal_id)
    if terminal:
        rows = terminal.rows
        cols = terminal.cols
        allow_browser_control = terminal.allow_browser_control
        initial_data = dict(
            terminal_id=terminal_id,
            cols=cols,
            rows=rows,
            allow_browser_control=allow_browser_control,
            command=terminal.command,
            broadcast_start_time_iso=terminal.broadcast_start_time_iso,
        )
        res.html = await templates.render("index.html", initial_data=initial_data)
    else:
        initial_data = dict(
            name=NAME, title=TITLE, cols=50, rows=15, allow_browser_control=False
        )
        res.html = await templates.render("index.html", initial_data=initial_data)


@app.websocket_route("/connect_browser_to_terminal")
async def connect_browser_to_terminal(ws):
    try:
        web_clients = set()
        async with ws:
            terminal_id = ws.query_params.get("id", None)
            terminal = terminals.get(terminal_id)
            if not terminal:
                raise ValueError("no terminal with id", terminal_id)

            web_clients = terminal.web_clients
            web_clients.add(ws)

            for web_client in terminal.web_clients:
                try:
                    await web_client.send_json(
                        {"event": "num_clients", "payload": len(web_clients)}
                    )
                except:
                    pass

            while True:
                browser_input = await ws.receive()
                if terminal.allow_browser_control:
                    await terminal.ws.send(
                        json.dumps({"event": "command", "payload": browser_input})
                    )
                else:
                    asyncio.sleep(100)

    except starlette.websockets.WebSocketDisconnect:
        for web_client in web_clients:
            await web_client.send_json(
                {"event": "num_clients", "payload": len(web_clients) - 1}
            )
    except Exception:
        print(traceback.format_exc())


async def _forward_terminal_data_to_web_clients(terminal: Terminal):
    while True:
        ws = terminal.ws
        web_clients = terminal.web_clients
        try:
            data = await ws.receive_json()
        except starlette.websockets.WebSocketDisconnect:
            for web_client in web_clients:
                await web_client.close()
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
            for web_client in web_clients:
                await web_client.close()
            return

        clients_to_remove = set()
        for web_client in web_clients:
            try:
                await web_client.send_json(data)
            except Exception:
                # print(traceback.format_exc())
                clients_to_remove.add(web_client)

        if clients_to_remove:
            for client in clients_to_remove:
                web_clients.remove(client)

            for web_client in web_clients:
                await web_client.send_json(
                    {"event": "num_clients", "payload": len(web_clients)}
                )


def _gen_terminal_id(ws: WebSocket) -> TerminalId:
    random = str(ws.__hash__()) + str(time.time()) + get_random_string(30)
    checksum = md5(random.encode())
    return TerminalId(checksum.hexdigest())


@app.websocket_route("/connect_to_terminal")
async def connect_to_terminal(ws):
    try:
        async with ws:
            terminal_id = _gen_terminal_id(ws)
            data = await ws.receive_json()
            terminal = Terminal(
                ws=ws,
                web_clients=set(),
                rows=data["rows"],
                cols=data["cols"],
                allow_browser_control=data["allow_browser_control"],
                command=data["command"],
                broadcast_start_time_iso=data["broadcast_start_time_iso"],
            )
            terminals[terminal_id] = terminal

            await ws.send(
                json.dumps({"event": "start_broadcast", "payload": terminal_id})
            )

            t1 = asyncio.ensure_future(_forward_terminal_data_to_web_clients(terminal))
            done, pending = await (
                asyncio.wait([t1], return_when=asyncio.FIRST_COMPLETED)
            )
            for task in pending:
                task.cancel()
    except Exception:
        print(traceback.format_exc())
    finally:
        terminals.pop(terminal_id, None)
