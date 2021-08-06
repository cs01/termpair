from starlette.websockets import WebSocket  # type: ignore

from .Terminal import Terminal


async def handle_ws_message_subprotocol_v3(ws: WebSocket, terminal: Terminal):
    browser_input = await ws.receive_json()
    event = browser_input.get("event")
    if event == "command":
        if terminal.allow_browser_control:
            await terminal.ws.send_json(browser_input)
    else:
        await terminal.ws.send_json(browser_input)
