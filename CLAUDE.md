# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is TermPair

End-to-end encrypted terminal sharing. A Unix terminal is shared in real-time to web browsers via a server that acts as a blind relay (zero-knowledge — server never sees plaintext). AES-128-GCM encryption with key delivered via URL hash fragment (never sent to server).

## Two Implementations

This repo has two implementations side by side:

1. **Python original** (`termpair/`, `tests/`) — FastAPI server, React/TypeScript/xterm.js frontend.
2. **Rust rewrite** (`termpair-rs/`) — Axum server, vanilla JS frontend with xterm.js. This is the active development target (see most recent commits).

Both share the same protocol and encryption scheme.

## Architecture

**Three components (both implementations):**
1. **Server** — routes encrypted WebSocket messages between terminal clients and browsers. Never decrypts.
2. **Terminal client** (`termpair share`) — forks a PTY, encrypts output with AES-GCM, sends via WebSocket. Decrypts browser input and writes to PTY.
3. **Frontend** — connects via WebSocket, decrypts terminal output for display, encrypts user input before sending.

**Encryption flow:** Three AES keys (bootstrap, unix_output, browser_input). Bootstrap key exchanged via URL hash. IVs are monotonic counters with per-browser windowing (2^20 messages per window). Key rotation after 2^20 messages.

**Protocol:** WebSocket subprotocol version "3". Messages are JSON `{event, payload}`. Key events: `new_output`, `command`, `resize`, `num_clients`, `aes_keys`, `aes_key_rotation`, `new_browser_connected`, `start_broadcast`.

### Rust Implementation (`termpair-rs/`)

- `src/main.rs` — CLI (clap) entry point, subcommands: `serve`, `share`
- `src/server/` — Axum WebSocket handlers, `terminal.rs` (session state)
- `src/share/` — PTY fork, AES key management, WebSocket broadcast
- `src/encryption.rs` — AES-128-GCM encrypt/decrypt
- `src/types.rs`, `src/constants.rs` — shared types and protocol constants
- `frontend/static/` — vanilla JS frontend (app.js, xterm.min.js, Web Crypto API for decryption)
- Static files are embedded into the binary via `rust-embed`

### Python Implementation (`termpair/`)

- `server.py` (FastAPI routes + WS handlers), `share.py` (PTY fork + broadcast), `encryption.py` (AES-GCM), `Terminal.py` (session state), `main.py` (CLI entry)
- `frontend_src/` — React/TypeScript frontend: `App.tsx`, `encryption.tsx`, `websocketMessageHandler.tsx`
- **Version sync:** `TERMPAIR_VERSION` in `termpair/constants.py` and `termpair/frontend_src/src/constants.tsx` must match.

## Build & Development Commands

### Rust

```bash
cd termpair-rs
cargo build              # debug build
cargo build --release    # release build
cargo run -- serve       # run server
cargo run -- share --cmd bash --host http://localhost:8000
```

### Python

```bash
pip install -e .         # editable install

# Frontend
make install_frontend    # yarn install in frontend_src/
make build_frontend      # production build → frontend_build/
make watch_frontend      # dev server with hot reload

# Run
nox -s serve             # start server
nox -s share             # start terminal sharing
termpair serve --port 8000
termpair share --cmd bash --host http://localhost:8000

# Test (--capture tee-sys required because termpair needs stdin fileno())
nox -s test
pytest tests --capture tee-sys
pytest tests/test_server.py::test_get_index -v  # single test

# Lint
nox -s lint              # black, flake8, mypy, check-manifest
pre-commit run --all-files

# Build executable
nox -s build_executable  # creates PEX file
```

## Key Dependencies

- **Rust:** axum, tokio, aes-gcm, nix (PTY), rust-embed (static files), clap, tracing
- **Python:** FastAPI, uvicorn, starlette, websockets, cryptography, aiofiles (Python 3.8+)
- **Python frontend:** React 16, xterm 4, tailwindcss, craco, TypeScript
