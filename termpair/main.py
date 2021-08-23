#!/usr/bin/env python3

import argparse
import asyncio
import os
import shlex
from urllib.parse import urlparse
import traceback
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware  # type: ignore
import uvicorn  # type: ignore
from . import share, server

from .constants import TermPairError, TERMPAIR_VERSION

__version__ = TERMPAIR_VERSION


def get_parser():
    p = argparse.ArgumentParser(
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        description="View and control remote terminals from your browser",
    )
    p.add_argument("--version", action="store_true")
    subparsers = p.add_subparsers(dest="command", required=True)

    share_parser = subparsers.add_parser(
        "share",
        description=(
            "Share your terminal session with one or more browsers. "
            "A termpair server must be running before using this command."
        ),
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    share_parser.add_argument(
        "--cmd",
        default=os.environ.get("SHELL", "bash"),
        help=(
            "The command to run in this TermPair session. "
            "Defaults to the SHELL environment variable"
        ),
    )
    share_parser.add_argument(
        "--port", "-p", default=8000, help="port server is running on"
    )
    share_parser.add_argument(
        "--host", default="http://localhost", help="host server is running on"
    )
    share_parser.add_argument(
        "--read-only",
        "-r",
        action="store_true",
        help="Do not allow browsers to write to the terminal",
    )
    share_parser.add_argument(
        "--open-browser",
        "-b",
        action="store_true",
        help="Open a browser tab to the terminal after you start sharing",
    )

    server_parser = subparsers.add_parser(
        "serve",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        description=(
            "Run termpair server to route messages between unix terminals and browsers. "
            "Run this before connecting any clients. "
            "TermPair only works in secure contexts; SSL/TLS is generally required. "
            "To generate an SSL certificate and private key, run "
            "`openssl req -newkey rsa:2048 -nodes -keyout host.key -x509 -days 365 -out host.crt`. "
            "To skip questions and use defaults, add the `-batch` flag. "
            "You can ignore warnings about self-signed certificates since you know you just made it. "
            "Then use them, pass the '--certfile' and '--keyfile' arguments."
        ),
    )
    server_parser.add_argument(
        "--port", "-p", default=8000, help="Port to run the server on"
    )
    server_parser.add_argument(
        "--host",
        default="localhost",
        help="Host to run the server on (0.0.0.0 exposes publicly)",
    )
    server_parser.add_argument(
        "--certfile",
        "-c",
        help="Path to SSL certificate file (commonly .crt extension)",
    )
    server_parser.add_argument(
        "--keyfile",
        "-k",
        help="Path to SSL private key .key file (commonly .key extension)",
    )
    return p


def run_command(args):
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
        allow_browser_control = not args.read_only
        try:
            asyncio.get_event_loop().run_until_complete(
                share.broadcast_terminal(
                    cmd, url, allow_browser_control, args.open_browser
                )
            )
        except TermPairError as e:
            exit(e)

    elif args.command == "serve":
        if args.certfile or args.keyfile:
            server.app.add_middleware(HTTPSRedirectMiddleware)

        uvicorn.run(
            server.app,
            host=args.host,
            port=int(args.port),
            ssl_certfile=args.certfile,
            ssl_keyfile=args.keyfile,
        )


def main():
    args = get_parser().parse_args()
    if args.version:
        print(__version__)
        exit(0)

    try:
        run_command(args)
    except Exception:
        print(
            "TermPair encountered an error. If you think this is a bug, it can be reported at https://github.com/cs01/termpair/issues"
        )
        print("")
        exit(traceback.format_exc())


if __name__ == "__main__":
    main()
