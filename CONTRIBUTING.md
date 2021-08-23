# Contributing guidelines

This short document should give you some hints to get started with contributing to TermPair.

## Getting started

First, fork the repo and clone it to your computer, then read the section you're interested in.

### Server

Install [nox](https://pypi.org/project/nox/).

You can run the server from source with:

```
nox -s serve-3.9
```

### Terminal Client

Install [nox](https://pypi.org/project/nox/).

You can run the terminal client from source with:
```
nox -s share-3.9
```

You can pass additional arguments like this
```
nox -s share-3.9 -- <arguments>
```

### Frontend Web App

First, get [yarn](https://yarnpkg.com/en/).

Next go to the directory `termpair/frontend_src` and run
```bash
yarn install
```
to install dependencies.

You can run the development server and hot reload changes. This is the easiest way to quickly statically serve the app from source.

```bash
yarn start
```

To build the production code, run:

```bash
yarn build
```
The static web app will be compiled to `termpair/termpair_build/`. TermPair will then serve this with `nox -s serve`.

You can also serve locally with
```
$ cd termpair/termpair/frontend_build
$ python3 -m http.server 7999 --bind 127.0.0.1
# Serves at http://127.0.01:7999
```
or deploy to GitHub pages, Vercel, etc.

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
