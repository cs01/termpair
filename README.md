<div style="text-align: center">
    <img src="https://github.com/cs01/termpair/raw/master/termpair/frontend_src/src/logo.png"/>
    <p>View and control remote terminals from your browser</p>

</div>

**Documentation**: https://cs01.github.io/termpair

**Source Code**: https://github.com/cs01/termpair

<a href="https://badge.fury.io/py/termpair"><img src="https://badge.fury.io/py/termpair.svg" alt="PyPI version" height="18"></a>
---

## What is TermPair?

TermPair lets developers share and control terminals in real time.

<div style="text-align: center">
    <img src="https://github.com/cs01/termpair/raw/master/termpair_browser.gif"/>
</div>

## Usage

Start the TermPair server:

```
termpair serve
```

Then share your terminal by running:

```
termpair share
```

A URL will be printed to the terminal, such as:

```
http://localhost:8000/?id=5a32e471453c0bb0c642acbbd6ee58f8
```

That URL is valid for the current terminal sharing session. The session ends when the process being broadcast ends, usually by typing `quit` or `exit`, or by closing the terminal window. At that time, the URL is no longer valid.

The session can be shared with others who you want to view and optionally control your terminal from a browser.

Pass the `-a` flag to grant the browser control of the terminal:

```
termpair share -a
```

## Quickstart

To quickly get up and running (without even having to install to your system!), use [pipx](https://github.com/pipxproject/pipx) to start the server:

```
pipx run termpair serve
```

Then share your client by running

```
pipx run termpair share -b
```

The `-b` flag will automatically open a browser tab to view the shared terminal.

## Installation

You can install using [pipx](https://github.com/pipxproject/pipx) or pip:

```
pipx install termpair
```

or

```
pip install termpair
```

## API

To view the command line API reference, run:

```
termpair --help
```

## Security Considerations

It should go without saying but this can be extremely dangerous if you use it improperly.

**You should only broadcast a terminal session you want to be shared, and only share the URL with those you trust.** No password is required after opening the URL, so consider it to be sensitive information!

By using TermPair, anyone with the sharable URL can:

- View every keystroke you make (even passwords that appear hidden in the terminal).
- View every character output by the terminal.

If you are in a public location, someone over your shoulder could see this url, or take a picture of it, providing them the ability to view or control your termpair session.

If you allow other users to control your terminal, they can:

- Run any commands.
- View/modify/delete any files.
- Restart or corrupt your computer.
- Install a virus.

If you run the server locally on the default host, it will not be accessible to anyone other than you. These security implications apply if you are exposing the port to others.

## System Requirements

Operating System:

- To view/control from the browser: All operating systems are supported.
- To run the server, `termpair serve`: Tested on Linux. Should work on macOS. Might work on Windows.
- To share your terminal, `termpair share`: Tested on Linux. Should work on macOS. Probably doesn't work on Windows.

Python: 3.6

### Run Server

The server acts as a router between a unix terminal broadcasting and the browser(s) that are remotely viewing the terminal.

It must be started before a terminal session can be broadcast.

```
$ termpair serve
INFO: Started server process [16592]
INFO: Waiting for application startup.
INFO: Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

Terminals can now broadcast to http://127.0.0.1:8000 🎉.

### Broadcast Your Terminal

To let others view your terminal:

```
$ termpair share
```

Your terminal is now viewable at `localhost:8000/?id=e8a7c806102134022455ddd1841470ed`. 🎉

To let others view **and remotely control** your terminal:

```
$ termpair share -a

...

WARNING: Your terminal is viewable AND controllable from

localhost:8000/?id=e8a7c806102134022455ddd1841470ed
...
```

When you run this, a new [pty](https://en.wikipedia.org/wiki/Pseudoterminal) process is started locally, and by default launches a new instance of the shell you are using, such as `bash`. But it can run any executable, interactive or not, with any arguments you want to supply.

You can pass the `--cmd` flag to specify the process that is shared in the terminal session.

```
termpair share  # shares current SHELL. Can run anything from within here, like vim.
termpair share --cmd $SHELL  # equivalent to the above command
termpair share --cmd "python"
termpair share --cmd "gdb"
termpair share --cmd "gdb -p 1234"
```

The sharing session ends when the process the terminal was sharing ends, usually by typing `exit` or `quit`. It can also be ended by closing the terminal itself. Each session is assigned a unique TermPair session id, which is a short string of characters. The session id is never shared with the server or any viewers watching the session.
