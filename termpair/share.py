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
import signal
import ssl
import sys
from urllib.parse import urljoin, urlencode
import webbrowser
from typing import List, Optional, Callable
import websockets  # type: ignore
from math import floor
from .Terminal import TerminalId
from .constants import subprotocol_version, TermPairError
from . import utils
from . import encryption

max_read_bytes = 1024 * 2
ws_queue: asyncio.Queue = asyncio.Queue()
JS_MAX_SAFE_INTEGER = 2 ** 53 - 1


class AesKeys:
    message_count: int

    def __init__(self):
        self.bootstrap_message_count = 0
        self.message_count = 0
        self.message_count_rotation_required = 2 ** 20
        self.browser_rotation_buffer_count = self.message_count_rotation_required * 0.1
        self.secret_bootstrap_key = encryption.aes_generate_secret_key()
        self.secret_unix_key = encryption.aes_generate_secret_key()
        self.secret_browser_key = encryption.aes_generate_secret_key()

    def encrypt_bootstrap(self, plaintext: bytes):
        self.bootstrap_message_count += 1
        return encryption.aes_encrypt(
            self.message_count, self.secret_bootstrap_key, plaintext
        )
        return encryption.aes_encrypt_with_random(self.secret_bootstrap_key, plaintext)

    def encrypt(self, plaintext: bytes):
        self.message_count += 1
        # encrypt with our AES key
        return encryption.aes_encrypt(
            self.message_count, self.secret_unix_key, plaintext
        )

    def decrypt(self, ciphertext: bytes) -> str:
        # decrypt with browser's AES key
        plaintext = encryption.aes_decrypt(self.secret_browser_key, ciphertext)
        return plaintext

    def get_max_iv_for_browser(self, start_iv_count: int) -> int:
        # each browser for this session encrypts using the same AES key.
        # To avoid re-using an IV, we assign each a window to operate within.
        # If the end of the window is hit, a new key is requested.
        max_iv_count = floor(
            start_iv_count
            + self.message_count_rotation_required
            - self.browser_rotation_buffer_count
        )
        if max_iv_count > JS_MAX_SAFE_INTEGER or max_iv_count < start_iv_count:
            raise TermPairError("Cannot create safe AES nonce")
        return max_iv_count

    def get_start_iv_count(self, browser_number: int) -> int:
        start_iv_count = (browser_number - 1) * self.message_count_rotation_required
        if start_iv_count > JS_MAX_SAFE_INTEGER:
            raise TermPairError("Cannot create safe AES nonce")
        return start_iv_count

    @property
    def need_rotation(self) -> bool:
        return self.message_count > self.message_count_rotation_required

    def rotate_keys(self):
        new_unix_key = encryption.aes_generate_secret_key()
        new_browser_key = encryption.aes_generate_secret_key()

        ws_queue.put_nowait(
            json.dumps(
                {
                    "event": "aes_key_rotation",
                    "payload": {
                        "b64_aes_secret_unix_key": base64.b64encode(
                            self.encrypt(new_unix_key)
                        ).decode(),
                        "b64_aes_secret_browser_key": base64.b64encode(
                            self.encrypt(new_browser_key)
                        ).decode(),
                    },
                }
            )
        )
        self.secret_unix_key = new_unix_key
        self.secret_browser_key = new_browser_key
        self.message_count = 0


class SharingSession:
    stdout_fd: int
    num_browsers: int

    def __init__(
        self,
        url: str,
        cmd: List[str],
        pty_fd: int,
        stdin_fd: int,
        stdout_fd: int,
        ws,
        open_browser: bool,
        allow_browser_control: bool,
    ):
        self.url = url
        self.cmd = cmd
        self.pty_fd = pty_fd
        self.stdin_fd = stdin_fd
        self.stdout_fd = stdout_fd
        self.ws = ws
        self.open_browser = open_browser
        self.allow_browser_control = allow_browser_control
        self.aes_keys = AesKeys()
        self.terminal_id = None
        self.num_browsers = 0

    async def register_broadcast_with_server(self) -> TerminalId:
        """Prepare server to store i/o about this terminal"""
        # copy our terminal dimensions to the pty so its row/col count
        # matches and we don't get unexpected line breaks/misalignments
        utils.copy_terminal_dimensions(self.stdin_fd, self.pty_fd)

        rows, cols = utils.get_terminal_size(self.stdin_fd)

        cmd_str = " ".join(self.cmd)
        broadcast_start_time_iso = datetime.datetime.now(
            datetime.timezone.utc
        ).isoformat()
        await self.ws.send(
            json.dumps(
                {
                    "rows": rows,
                    "cols": cols,
                    "allow_browser_control": self.allow_browser_control,
                    "command": cmd_str,
                    "broadcast_start_time_iso": broadcast_start_time_iso,
                    "subprotocol_version": subprotocol_version,
                }
            )
        )
        event, payload = await self.receive_data_from_websocket()
        if event == "start_broadcast":
            return payload
        elif event == "fatal_error":
            raise TermPairError(fatal_server_error_msg(payload))
        else:
            raise TermPairError(
                "Unexpected event type received when starting broadcast. "
                + "Ensure you are using a compatible version with the server.",
                event,
            )

    async def run(self):
        self.terminal_id = await self.register_broadcast_with_server()

        self.print_broadcast_init_message()

        with utils.make_raw(self.stdin_fd):
            await self.do_broadcast()

    async def do_broadcast(self):
        signal.signal(
            signal.SIGWINCH,
            lambda signum, frame: self.emit_terminal_dimensions(),
        )
        if self.open_browser:
            webbrowser.open(self.share_url)

        tasks = [
            asyncio.ensure_future(self.task_send_ws_queue_to_server()),
            asyncio.ensure_future(self.task_receive_websocket_messages()),
        ]

        loop = asyncio.get_event_loop()

        def cleanup():
            for t in tasks:
                t.cancel()
                loop.remove_reader(self.stdin_fd)
                loop.remove_reader(self.pty_fd)

        # add event-based reading of input to stdin, and forward to the pty
        # process
        loop.add_reader(self.stdin_fd, self.handle_new_stdin)

        # add event based reading of output from the pty and write to
        # stdout and to the server
        loop.add_reader(
            self.pty_fd,
            self.handle_new_pty_output,
            cleanup,
        )

        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()

    def handle_new_stdin(self):
        """forwards from terminal's stdin to the pty's stdin"""
        user_input = os.read(self.stdin_fd, max_read_bytes)
        os.write(self.pty_fd, user_input)

    def emit_terminal_dimensions(self):
        utils.copy_terminal_dimensions(self.stdin_fd, self.pty_fd)
        rows, cols = utils.get_terminal_size(self.stdin_fd)
        ws_queue.put_nowait(
            json.dumps({"event": "resize", "payload": {"rows": rows, "cols": cols}})
        )

    async def task_receive_websocket_messages(self):
        """receives events+payloads from browser websocket connection"""
        try:
            while True:
                event, payload = await self.receive_data_from_websocket()
                if event == "command":
                    if self.allow_browser_control:
                        try:
                            encrypted_payload = base64.b64decode(payload)
                            json_data = self.aes_keys.decrypt(encrypted_payload)
                            data = json.loads(json_data)["data"]
                            os.write(self.pty_fd, data.encode())
                        except Exception:
                            pass
                elif event == "request_terminal_dimensions":
                    self.emit_terminal_dimensions()
                elif event == "request_key_rotation":
                    self.aes_keys.rotate_keys()
                elif event == "new_browser_connected":
                    # no payload required, just the event.
                    # the browser must already have
                    # the bootstrap AES key to decrypt the
                    # message we're about to
                    self.num_browsers += 1
                    try:
                        # use the bootstrap AES key to encrypt the two AES keys
                        # used for terminal input/output
                        b64_bootstrap_unix_aes_key = base64.b64encode(
                            self.aes_keys.encrypt_bootstrap(
                                self.aes_keys.secret_unix_key
                            )
                        ).decode()
                        b64_bootstrap_browser_aes_key = base64.b64encode(
                            self.aes_keys.encrypt_bootstrap(
                                self.aes_keys.secret_browser_key
                            )
                        ).decode()

                        iv_count = self.aes_keys.get_start_iv_count(self.num_browsers)
                        ws_queue.put_nowait(
                            json.dumps(
                                {
                                    "event": "aes_keys",
                                    "payload": {
                                        "b64_bootstrap_unix_aes_key": b64_bootstrap_unix_aes_key,
                                        "b64_bootstrap_browser_aes_key": b64_bootstrap_browser_aes_key,
                                        "iv_count": iv_count,
                                        "max_iv_count": self.aes_keys.get_max_iv_for_browser(
                                            iv_count
                                        ),
                                        "salt": base64.b64encode(
                                            os.urandom(12)
                                        ).decode(),
                                    },
                                }
                            )
                        )
                    except Exception as e:
                        print(e)
                elif event == "fatal_error":
                    raise fatal_server_error_msg(payload)
                else:
                    # TODO log to a file
                    pass
        except websockets.exceptions.ConnectionClosed:
            return

    async def task_send_ws_queue_to_server(self):
        """Waits for new pty output (nonblocking), then immediately sends to server"""
        while True:
            data = await ws_queue.get()
            await self.ws.send(data)

    async def receive_data_from_websocket(self):
        data = await self.ws.recv()
        parsed = json.loads(data)
        return parsed["event"], parsed.get("payload")

    def print_broadcast_init_message(self):
        _, cols = utils.get_terminal_size(sys.stdin)
        secret_key_b64 = base64.b64encode(self.aes_keys.secret_bootstrap_key).decode()
        msg = [
            "\033[1m\033[0;32mConnection established with end-to-end encryption\033[0m 🔒",
            "",
            "Shareable link: "
            + self.get_share_url(self.url, self.terminal_id, secret_key_b64),
            "",
            f"Terminal ID: {self.terminal_id}",
            f"Secret encryption key: {secret_key_b64}",
            f"TermPair Server URL: {self.url}",
            "",
            "Type 'exit' or close terminal to stop sharing.",
        ]

        dashes = "-" * cols
        print(dashes)
        for m in msg:
            print(m)
        print(dashes)

    def get_share_url(
        self,
        url: str,
        terminal_id: str,
        secret_key_b64: str,
    ):
        # if static_url:
        #     qp = {
        #         "terminal_id": terminal_id,
        #         "termpair_server_url": url,
        #     }
        #     return urljoin(static_url, f"?{urlencode(qp)}")
        # else:

        qp = {
            "terminal_id": terminal_id,
        }
        return urljoin(url, f"?{urlencode(qp)}#{secret_key_b64}")

    def handle_new_pty_output(self, cleanup: Callable):
        """forwards pty's output to local stdout AND to websocket"""
        try:
            pty_output = os.read(self.pty_fd, max_read_bytes)
        except OSError:
            cleanup()
            return

        if pty_output:
            # forward output to user's terminal
            os.write(self.stdout_fd, pty_output)

            # also forward output to the server so it can forward to connected browsers
            plaintext_payload = json.dumps(
                {
                    "pty_output": base64.b64encode(pty_output).decode(),
                    "salt": base64.b64encode(os.urandom(12)).decode("utf8"),
                }
            )
            encrypted_payload = self.aes_keys.encrypt(plaintext_payload.encode())
            ws_queue.put_nowait(
                json.dumps(
                    {
                        "event": "new_output",
                        "payload": base64.b64encode(encrypted_payload).decode(),
                    }
                )
            )
            if self.aes_keys.need_rotation:
                self.aes_keys.rotate_keys()
        else:
            cleanup()
            return


def fatal_server_error_msg(error_msg: str):
    raise TermPairError("Connection was terminated with a fatal error: " + error_msg)


async def broadcast_terminal(
    cmd: List[str], url: str, allow_browser_control: bool, open_browser: bool
):
    """Fork this process and connect it to websocket to broadcast it"""
    # create child process attached to a pty we can read from and write to

    (child_pid, pty_fd) = pty.fork()
    if child_pid == 0:
        # This is the forked process. Replace it with the shell command
        # the user wants to run.
        env = os.environ.copy()
        env["TERMPAIR_BROADCASTING"] = "1"
        env["TERMPAIR_BROWSERS_CAN_CONTROL"] = "1" if allow_browser_control else "0"
        os.execvpe(cmd[0], cmd, env)
        return

    stdin_fd = sys.stdin.fileno()
    stdout_fd = sys.stdout.fileno()

    ssl_context: Optional[ssl.SSLContext] = (
        ssl.SSLContext(ssl.PROTOCOL_TLS) if url.startswith("https") else None
    )

    ws_url = url.replace("http", "ws")

    ws_endpoint = urljoin(ws_url, "connect_to_terminal")
    try:
        async with websockets.connect(ws_endpoint, ssl=ssl_context) as ws:
            sharing_session = SharingSession(
                url,
                cmd,
                pty_fd,
                stdin_fd,
                stdout_fd,
                ws,
                open_browser,
                allow_browser_control,
            )
            await sharing_session.run()
            print(
                f"You are no longer broadcasting terminal id {sharing_session.terminal_id}"
            )
    except ConnectionRefusedError as e:
        raise TermPairError(
            "Connection was refused. Is the TermPair server running on the host and port specified? "
            + str(e),
        )
