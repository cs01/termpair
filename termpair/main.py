#!/usr/bin/env python3

import argparse
import asyncio
import os
import shlex
from urllib.parse import urlparse
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware  # type: ignore
import uvicorn  # type: ignore
from . import share, server

__version__ = "0.0.1.3"


def main():
    p = argparse.ArgumentParser(
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        description="View and control remote terminals from your browser",
    )
    p.add_argument("--version", action="store_true")
    subparsers = p.add_subparsers(dest="command")

    sp = subparsers.add_parser(
        "share",
        description=(
            "Share your terminal session with one or more browsers. "
            "A termpair server must be running before using this command."
        ),
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    sp.add_argument(
        "--cmd",
        default=os.environ.get("SHELL", "bash"),
        help=(
            "The command to run in this termshare session. "
            "Defaults to the SHELL environment variable"
        ),
    )
    sp.add_argument("--port", "-p", default=None, help="port server is running on")
    sp.add_argument(
        "--host", default="http://localhost", help="host server is running on"
    )
    sp.add_argument(
        "--no-browser-control",
        "-n",
        action="store_true",
        help="Do not allow browsers to control your terminal remotely",
    )
    sp.add_argument(
        "--open-browser",
        "-b",
        action="store_true",
        help="Open a browser tab to the terminal after you start sharing",
    )

    sp = subparsers.add_parser(
        "serve",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        description=(
            "Run termpair server to route messages between unix terminals and browsers. "
            "Run this before connecting any clients. "
            "It is highly recommended to encrypt communication by using SSL. "
            "To generate a SSL certificate and private key, run "
            "`openssl req -newkey rsa:2048 -nodes -keyout host.key -x509 -days 365 -out host.crt`. "
            "To skip questions and use defaults, add the `-batch` flag. "
            "You can ignore warnings about self-signed certificates since you know you just made it. "
            "Then use them, pass the '--certfile' and '--keyfile' arguments."
        ),
    )
    sp.add_argument("--port", "-p", default=8000, help="Port to run the server on")
    sp.add_argument(
        "--host",
        default="localhost",
        help="Host to run the server on (0.0.0.0 exposes publicly)",
    )
    sp.add_argument(
        "--certfile",
        "-c",
        help="Path to SSL certificate file (commonly .crt extension)",
    )
    sp.add_argument(
        "--keyfile",
        "-k",
        help="Path to SSL private key .key file (commonly .key extension)",
    )

    args = p.parse_args()
    if args.version:
        print(__version__)
        exit(0)

    if args.command == "share":
        cmd = shlex.split(args.cmd)

        if not args.host.startswith("http://") and not args.host.startswith("https://"):
            exit("host must start with either http:// or https://")

        parsed = urlparse(args.host)
        if args.port:
            url = f"{parsed.scheme}://{parsed.netloc}:{args.port}{parsed.path}"
        else:
            url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
        url = url if url.endswith("/") else f"{url}/"
        allow_browser_control = not args.no_browser_control
        asyncio.get_event_loop().run_until_complete(
            share.broadcast_terminal(cmd, url, allow_browser_control, args.open_browser)
        )
    elif args.command == "serve":
        if args.certfile or args.keyfile:
            server.app.add_asgi_middleware(HTTPSRedirectMiddleware)

        uvicorn.run(
            server.app,
            host=args.host,
            port=int(args.port),
            ssl_certfile=args.certfile,
            ssl_keyfile=args.keyfile,
        )


if __name__ == "__main__":
    main()
