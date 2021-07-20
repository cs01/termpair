from fastapi.testclient import TestClient  # type:ignore
from termpair import server

from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware  # type:ignore

client = TestClient(server.app)


def test_read_main():
    response = client.get("/")
    assert response.status_code == 200


def test_terminal_data():
    response = client.get("/terminal/invalid-terminal-id")
    assert response.status_code == 404

    response = client.get("/terminal/")
    assert response.status_code == 404


def test_can_add_middleware():
    server.app.add_middleware(HTTPSRedirectMiddleware)
