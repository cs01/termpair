from starlette.websockets import WebSocket  # type: ignore

from .Terminal import Terminal


async def handle_ws_message_subprotocol_v1(ws: WebSocket, terminal):
    browser_input = await ws.receive_json()
    event = browser_input.get("event")
    if event == "command":
        if terminal.allow_browser_control:
            await terminal.ws.send_json(browser_input)
    else:
        # print("unhandled event in v1", event)
        pass


async def handle_ws_message_subprotocol_v2(ws: WebSocket, terminal: Terminal):
    browser_input = await ws.receive_json()
    event = browser_input.get("event")
    if event == "command":
        if terminal.allow_browser_control:
            await terminal.ws.send_json(browser_input)
    elif event == "request_terminal_dimensions":
        await terminal.ws.send_json(browser_input)
    else:
        await ws.send_json({"event": "error", "payload": f"Event {event} is invalid"})