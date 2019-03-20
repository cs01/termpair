# Contributing guidelines

Welcome! We're glad to see you here. This short document should give you some hints to get started with contributing to TermPair.

## Getting started

First, fork the repo and clone it to your computer, then read the section you're interested in. 👍

### Contributing Python code

To modify Python code, setup a virtual environment:

```bash
python -m venv venv
```

Then activate it with:

```bash
. venv/bin/activate
```

You can then install development dependencies using:

```bash
pip install -e ".[dev]"
```

### Contributing frontend code

To modify frontend code, get [yarn](https://yarnpkg.com/en/) and run:

```
make install_frontend
```

to install dependencies.

You'll then be able to build the frontend app using:

```bash
make build_frontend
```

You'll need to reload the TermPair server for changes to be taken into account. Stop it with `Ctrl+C`, then restart it:

```bash
termpair server
```

Alternatively, changes that don't require an actively connected terminal can be tested much more easily with hot reloading by running:

```bash
make watch_frontend
```

### Contributing documentation

TermPair's documentation is built with [MkDocs](https://www.mkdocs.org) and the [MkDocs Material theme](https://squidfunk.github.io/mkdocs-material/).

To run the documentation site locally, run:

```bash
mkdocs serve
```

## Proposing changes

If you've found a bug, have a feature request, or would like to contribute documentation, here's what you can do to have your change merged in:

1. (Recommended) If the problem is non-trivial, you should [open an issue][issue] to discuss it with maintainers.
2. Work on a separate branch, and make sure tests pass before pushing them to the remote.
3. [Open a pull request][pr] with your changes.

[issue]: https://github.com/cs01/termpair/issues/new
[pr]: https://github.com/cs01/termpair/compare
