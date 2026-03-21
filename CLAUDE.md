# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is TermPair

End-to-end encrypted terminal sharing. A Unix terminal is shared in real-time to web browsers via a server that acts as a blind relay (zero-knowledge — server never sees plaintext). AES-128-GCM encryption with key delivered via URL hash fragment (never sent to server).

## Architecture

**Three components:**
1. **Server** (Python/FastAPI) — routes encrypted WebSocket messages between terminal clients and browsers. Never decrypts.
2. **Terminal client** (`termpair share`) — forks a PTY, encrypts output with AES-GCM, sends via WebSocket. Decrypts browser input and writes to PTY.
3. **Frontend** (React/TypeScript/xterm.js) — connects via WebSocket, decrypts terminal output for display, encrypts user input before sending.

**Encryption flow:** Three AES keys (bootstrap, unix_output, browser_input). Bootstrap key exchanged via URL hash. IVs are monotonic counters with per-browser windowing (2^20 messages per window). Key rotation after 2^20 messages.

**Key backend files:** `server.py` (FastAPI routes + WS handlers), `share.py` (PTY fork + broadcast), `encryption.py` (AES-GCM), `Terminal.py` (session state), `main.py` (CLI entry).

**Frontend:** `App.tsx` (main component), `encryption.tsx` (Web Crypto API), `websocketMessageHandler.tsx` (WS event dispatch), xterm.js for rendering.

**Version sync:** `TERMPAIR_VERSION` in `termpair/constants.py` and `termpair/frontend_src/src/constants.tsx` must match.

## Build & Development Commands

```bash
# Frontend
make install_frontend    # yarn install in frontend_src/
make build_frontend      # production build → frontend_build/
make watch_frontend      # dev server with hot reload

# Backend
pip install -e .         # editable install

# Run
nox -s serve             # start server
nox -s share             # start terminal sharing
termpair serve --port 8000
termpair share --cmd bash --host http://localhost:8000

# Test
nox -s test              # runs pytest with tee-sys capture
pytest tests --capture tee-sys
pytest tests/test_server.py::test_get_index -v  # single test

# Lint
nox -s lint              # black, flake8, mypy, check-manifest
pre-commit run --all-files

# Build executable
nox -s build_executable  # creates PEX file
```

## Key Dependencies

- Backend: FastAPI, uvicorn, starlette, websockets, cryptography, aiofiles
- Frontend: React 16, xterm 4, tailwindcss, react-toastify, TypeScript
- Frontend uses craco (Create React App Configuration Override) + tailwind
- Python 3.8+ required

## Protocol

WebSocket subprotocol version: "3". Messages are JSON `{event, payload}`. Key events: `new_output`, `command`, `resize`, `num_clients`, `aes_keys`, `aes_key_rotation`, `new_browser_connected`, `start_broadcast`.
