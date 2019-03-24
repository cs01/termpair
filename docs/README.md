<div style="text-align: center">
    <img src="https://github.com/cs01/termpair/raw/master/termpair/frontend_src/src/logo.png"/>
    <p>View and control remote terminals from your browser</p>
</div>

---

# Introduction

## What is TermPair?

TermPair lets developers collaborate, view, and share terminals, all in real time. Plus it's easy to use!

## Usage

Start sharing your terminal by running `termpair share`:

<div style="text-align: center">
    <img src="https://github.com/cs01/termpair/raw/master/termpair_terminal.png"/>
</div>

A URL will be printed to the terminal, such as:

```
http://localhost:8000/?id=5a32e471453c0bb0c642acbbd6ee58f8
```

That URL is valid for the current terminal sharing session. The session ends when the process being broadcast ends, usually by typing `quit` or `exit`, or by closing the terminal window. At that time, the URL is no longer valid.

The session can be shared with others who you want to view and optionally control your terminal from a browser:

<div style="text-align: center">
    <img src="https://github.com/cs01/termpair/raw/master/termpair_browser.png"/>
</div>

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

## Run Server

The server acts as a router between unix terminal broadcasting and the browser(s) that are remotely viewing the terminal.

```
$ termpair serve
INFO: Started server process [16592]
INFO: Waiting for application startup.
INFO: Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

Terminals can now be shared at http://127.0.0.1:8000. However, to actually connect to a terminal in the browser, a terminal id must be supplied. Terminal id's consist of long strings of characters and should be basically impossible to guess. Terminal id's and their associated URL are provided to the user whenthey begin sharing their unix terminal.

## Broadcast Your Terminal

To let others view your terminal:

```
$ termpair share

Sharing all input and output of `bash -l`.

WARNING: Your terminal is viewable but NOT controllable from

localhost:8000/?id=e8a7c806102134022455ddd1841470ed

Type 'exit' to stop sharing.

When you are no longer sharing, you will see the secret string 'dxQDwwWms844' printed.


$ exit
logout
You are no longer broadcasting (dxQDwwWms844)
```

To let others view **and remotely control** your terminal:

```
$ termpair share -a

...

WARNING: Your terminal is viewable AND controllable from

localhost:8000/?id=e8a7c806102134022455ddd1841470ed
...
```

By default it runs whichever shell you are using, such as `bash`. But it can run any executable. The sharing session ends when the process the terminal was sharing ends, usually by typing `exit` or `quit`. It can also be ended by closing the terminal itself.

You can pass the `--cmd` flag to specify the process that is shared in the terminal session.

```
termpair share  # shares current SHELL. Can run anything from within here, like vim.
termpair share --cmd $SHELL  # equivalent to the above command
termpair share --cmd "python"
termpair share --cmd "gdb"
termpair share --cmd "gdb -p 1234"
```
