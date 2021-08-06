# Contributing guidelines

This short document should give you some hints to get started with contributing to TermPair.

## Getting started

First, fork the repo and clone it to your computer, then read the section you're interested in.

### Contributing Python code

Install [nox](https://pypi.org/project/nox/).

You can run the server from source with:

```
nox -s serve
```

After the server is running, you can share your terminal to it by running the client code from source:
```
nox -s broadcast
```
Then type `exit` to stop broadcasting.


### Contributing frontend code

To modify frontend code, get [yarn](https://yarnpkg.com/en/).

Next go to the directory `termpair/frontend_src` and run
```bash
yarn install
```
to install dependencies.

You'll then be able to view and hot reload changes to the frontend app using:

```bash
yarn start
```

The TermPair server does not need to be reloaded, so you can just refresh the webpage to view changes.

If you want to connect a terminal to the frontend, in a new terminal run
```
nox -s serve
```
then share a terminal with
```
nox -s broadcast
```
open the browser at `http://localhost:3000` and enter the terminal id and url (`http://localhost:8000`).

If you are testing something that needs a full build, you can build and statically serve the frontend with

```bash
yarn build
```

## Releasing new versions to PyPI
```
nox -s publish
```

## Proposing changes

If you've found a bug, have a feature request, or would like to contribute documentation, here's what you can do to have your change merged in:

1. (Recommended) If the problem is non-trivial, you should [open an issue][issue] to discuss it
2. Work on a separate branch, and make sure tests pass before pushing them to the remote.
3. [Open a pull request][pr] with your changes.

[issue]: https://github.com/cs01/termpair/issues/new
[pr]: https://github.com/cs01/termpair/compare
