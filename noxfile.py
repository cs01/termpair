from pathlib import Path

import nox  # type: ignore


python = "3.8"
nox.options.sessions = ["lint"]
nox.options.reuse_existing_virtualenvs = True

doc_deps = [".", "jinja2", "mkdocs", "mkdocs-material"]
dev_deps = ["mypy", "black"]
lint_deps = ["black", "flake8", "flake8-bugbear", "mypy", "check-manifest"]
test_deps = ["pytest"]


@nox.session(python=python)
def serve(session):
    print("Note: Frontend must be built for this to work")
    session.install("-e", ".")
    session.run("termpair", "serve", *session.posargs)


@nox.session(python=python)
def broadcast(session):
    print("Note: Frontend must be built for this to work")
    session.install("-e", ".")
    session.run("termpair", "share", *session.posargs)


@nox.session(python=python)
def watch_docs(session):
    session.install(*doc_deps)
    session.run("mkdocs", "serve")


@nox.session(python=python)
def publish_docs(session):
    # session.install(*doc_deps)
    # session.run("mkdocs", "gh-deploy")
    session.run("git", "checkout", "gh-pages")
    session.run("rm", "-rf", "site/connect/")
    session.run("mkdir", "site/connect")
    session.run("cp", "termpair/frontend_build/", "site/connect/")
    session.run("git", "commit", "-m", "commit built frontend")
    session.run("git", "checkout", "master")


@nox.session(python=python)
def publish(session):
    print("REMINDER: Has the changelog been updated?")
    session.run("rm", "-rf", "dist", "build", external=True)
    publish_deps = ["setuptools", "wheel", "twine"]
    session.install(*publish_deps)
    session.run("make", "build_frontend", external=True)
    session.run("python", "setup.py", "--quiet", "sdist", "bdist_wheel")
    session.run("python", "-m", "twine", "upload", "dist/*")
    publish_docs(session)


@nox.session(python=python)
def lint(session):
    session.install(*lint_deps)
    files = ["termpair", "tests"] + [str(p) for p in Path(".").glob("*.py")]
    session.run("black", "--check", *files)
    session.run("flake8", *files)
    session.run("mypy", *files)
    session.run("check-manifest")
    session.run("python", "setup.py", "check", "--metadata", "--strict")


@nox.session(python=python)
def test(session):
    session.install(".", *test_deps)
    session.run("pytest", "tests", *session.posargs)
