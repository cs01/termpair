# Contributing guidelines

## Getting started

Fork the repo and clone it, then build and run from the `termpair-rs/` directory.

### Server

```
cd termpair-rs
cargo run -- serve
```

### Terminal Client

```
cd termpair-rs
cargo run -- share --cmd bash --host http://localhost:8000
```

### Frontend

The frontend is vanilla JS in `termpair-rs/frontend/static/`. It gets embedded into the binary via `rust-embed`, so just rebuild with `cargo build` after making changes.

### Tests

```
cargo test
```

### Formatting and Linting

```
cargo fmt --check
cargo clippy -- -D warnings
```

CI runs these checks on every push and pull request.

## Proposing changes

1. (Recommended) If the problem is non-trivial, [open an issue][issue] to discuss it
2. Work on a separate branch, and make sure tests pass before pushing
3. [Open a pull request][pr] with your changes

[issue]: https://github.com/cs01/termpair/issues/new
[pr]: https://github.com/cs01/termpair/compare
