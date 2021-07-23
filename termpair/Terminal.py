import asyncio
from typing import List, NamedTuple, NewType

from starlette.websockets import WebSocket  # type: ignore


class Terminal(NamedTuple):
    ws: WebSocket
    rows: int
    cols: int
    browser_websockets: List[WebSocket]
    browser_tasks: List[asyncio.Task]
    allow_browser_control: bool
    command: str
    broadcast_start_time_iso: str
    subprotocol_version: str


TerminalId = NewType("TerminalId", str)
