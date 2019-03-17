# TermPair – View and control remote terminals from your browser

TermPair lets people collaborate, view, and share, all in real time. And it's easy to use!

To try it, use [pipx](https://github.com/pipxproject/pipx) start the server

```
pipx run termpair serve
```

then share your terminal

```
pipx run termpair share -b
```

your browser will open, and you can view whatever is printed to the terminal.

<p align="center">
<img align="center" src="https://github.com/cs01/termpair/raw/master/termpair_terminal.png"/>
<img align="center" src="https://github.com/cs01/termpair/raw/master/termpair_browser.png"/>
</p>

It works with any program: vim, emacs, tmux, ssh, anything you want!

If you want the browser to be able to send input to your terminal, start sharing with the `-a` flag as well:

```
pipx run termpair share -ba
```

By default it runs whichever shell you are using, such as `bash`. But it can run any executable. Pass the `--cmd` flag to customize this.

```
termpair share  # shares current SHELL. Can run anything from within here, like vim.
termpair share --cmd $SHELL  # equivalent to the above command
termpair share --cmd "python"
termpair share --cmd "gdb"
termpair share --cmd "gdb -p 1234"
```

## Security Considerations

It should go without saying but this can be extremely dangerous if you use it improperly.

By using termpair, anyone with the sharable URL can

- view every keystroke you make (even passwords that appear hidden in the terminal)
- view every character output by the terminal

If you are in a public location, someone over your shoulder could see this url, or take a picture of it, providing them the ability to view or control your termpair session.

If you allow other users to control your terminal, they can

- run any commands
- view/modify/delete any files
- restart or corrupt your computer
- install a virus
- etc

If you run the server locally on the default host, none of this can happen. The security implications only apply if you are exposing the port to others.

Still interested? Read on!

## System Requirements

Operating System: Tested on Linux. Should work on macOS. Probably doesn't work on Windows.

Python: 3.6

## API

To view the API, run

```
termpair --help
```

## Run Server

The server acts as a router between unix terminal broadcasting and the browser(s) that are remotely viewing the terminal.

```
$ termpair serve
INFO: Started server process [16592]
INFO: Waiting for application startup.
INFO: Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

You can now view terminals at http://127.0.0.1:8000, but you need to specify the terminal id.

## Broadcast Your Terminal

To let others view your terminal

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

To let others view **and remotely control** your terminal

```
$ termpair share -a

...

WARNING: Your terminal is viewable AND controllable from

localhost:8000/?id=e8a7c806102134022455ddd1841470ed
...
```

# Contributing

Clone repo, then

```
pip install -e .
```

to modify Python code.

To modify frontend code, run

```
make build_frontend
```

then reload the pyterm server with

```
termpair server
```
