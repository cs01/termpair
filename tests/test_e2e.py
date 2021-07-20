from fastapi.testclient import TestClient
from termpair import server, utils
import subprocess
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware
from time import sleep
import socket
import tty
import sys
import signal
import psutil

client = TestClient(server.app)


def get_open_port() -> int:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("", 0))
    s.listen(1)
    port = s.getsockname()[1]
    s.close()
    return port


def test_server():
    open_port = str(get_open_port())
    server = subprocess.Popen(["termpair", "serve", "--port", open_port])
    sleep(0.1)
    assert server.poll() == None
    server.kill()


def test_e2e():
    sys.stdin.fileno()
    mode = tty.tcgetattr(sys.stdin.fileno())
    try:
        open_port = str(get_open_port())
        server = subprocess.Popen(
            ["termpair", "serve", "--port", open_port],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        sleep(0.5)
        broadcast = subprocess.Popen(
            ["termpair", "share", "--cmd", "bash", "--port", open_port],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        sleep(0.5)
        assert server.poll() == None
        assert broadcast.poll() == None
        server.kill()
        kill_child_processes(broadcast.pid)
        broadcast.kill()
        tty.setcbreak(sys.stdin.fileno())
        tty.tcsetattr(sys.stdin.fileno(), tty.TCSAFLUSH, mode)
        server_output = server.stderr.read().decode()

        assert "Started server process" in server_output
        assert '- "WebSocket /connect_to_terminal" [accepted]' in server_output

        broadcast_output = broadcast.stdout.read().decode()
        assert "Type 'exit' or close terminal to stop sharing." in broadcast_output
    finally:
        tty.setcbreak(sys.stdin.fileno())
        tty.tcsetattr(sys.stdin.fileno(), tty.TCSAFLUSH, mode)


def kill_child_processes(parent_pid, sig=signal.SIGTERM):
    try:
        parent = psutil.Process(parent_pid)
    except psutil.NoSuchProcess:
        return
    children = parent.children()
    for process in children:
        process.send_signal(sig)
