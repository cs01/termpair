# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Worktree Rule

**ALWAYS work on a git worktree and branch. NEVER modify files directly on `main`.** `main` must always remain clean. Every piece of work — features, bug fixes, docs, even CLAUDE.md edits — must happen on a dedicated branch in a worktree:

```bash
git worktree add .worktrees/<name> -b <branch-name>
cd .worktrees/<name>
# do work, commit, then open a PR
```

## Autonomous PR Workflow

Agents can work autonomously end-to-end: create worktrees, make changes, push branches, create PRs,
monitor CI, and merge when green. You have push access to feature branches and merge access to PRs.

1. Create a worktree and branch
2. Make changes, run `cargo test && cargo fmt --check && cargo clippy` in `termpair-rs/`, commit
3. `git push origin <branch>` — push to remote
4. `gh pr create` — open a PR
5. `gh pr checks <number>` — monitor CI
6. When CI is green: `gh pr merge <number> --squash --delete-branch` — merge to main
7. Clean up: return to repo root and `git worktree remove .worktrees/<name>`
8. Pull main and continue with next task

**Every PR must be seen through to completion** — don't just open and walk away. Monitor CI, fix failures,
merge when green, delete the remote branch, and remove the local worktree.

**Never push to main directly.** Always go through PRs.

## What is TermPair

End-to-end encrypted terminal sharing. A Unix terminal is shared in real-time to web browsers via a server that acts as a blind relay (zero-knowledge — server never sees plaintext). AES-128-GCM encryption with key delivered via URL hash fragment (never sent to server).

## Architecture

**Three components:**
1. **Server** — routes encrypted WebSocket messages between terminal clients and browsers. Never decrypts.
2. **Terminal client** (`termpair share`) — forks a PTY, encrypts output with AES-GCM, sends via WebSocket. Decrypts browser input and writes to PTY.
3. **Frontend** — connects via WebSocket, decrypts terminal output for display, encrypts user input before sending.

**Encryption flow:** Three AES keys (bootstrap, unix_output, browser_input). Bootstrap key exchanged via URL hash. IVs are monotonic counters with per-browser windowing (2^20 messages per window). Key rotation after 2^20 messages.

**Protocol:** WebSocket subprotocol version "3". Messages are JSON `{event, payload}`. Key events: `new_output`, `command`, `resize`, `num_clients`, `aes_keys`, `aes_key_rotation`, `new_browser_connected`, `start_broadcast`.

**Key source files** (all under `termpair-rs/`):

- `src/main.rs` — CLI (clap) entry point, subcommands: `serve`, `share`
- `src/server/` — Axum WebSocket handlers, `terminal.rs` (session state)
- `src/share/` — PTY fork, AES key management (`aes_keys.rs`), WebSocket broadcast (`session.rs`)
- `src/encryption.rs` — AES-128-GCM encrypt/decrypt (has unit tests)
- `src/types.rs`, `src/constants.rs` — shared types and protocol constants
- `frontend/static/` — vanilla JS frontend (app.js, xterm.min.js, Web Crypto API for decryption)
- Static files are embedded into the binary via `rust-embed`

**Legacy Python implementation** (`termpair/`, `tests/`) still exists in the repo but is not actively developed.

## Build & Development Commands

All commands run from `termpair-rs/`.

```bash
cargo build              # debug build
cargo build --release    # release build
cargo run -- serve       # run server
cargo run -- share --cmd bash --host http://localhost:8000
cargo test               # run unit tests
cargo fmt --check        # check formatting
cargo clippy             # lint
```

## Key Dependencies

axum, tokio, aes-gcm, nix (PTY), rust-embed (static files), clap, tracing

## Releasing

Push a `v*` tag to trigger `.github/workflows/release.yml`, which cross-compiles for linux (x86_64, aarch64) and macOS (x86_64, aarch64), then creates a GitHub Release with tarballs and checksums.

```bash
git tag v0.5.0
git push origin v0.5.0
```

`install.sh` at the repo root is a curl-installable script that downloads the latest release binary for the user's platform.
