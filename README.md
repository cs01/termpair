<div style="text-align: center">
    <img src="https://github.com/cs01/termpair/raw/master/termpair/frontend_src/src/logo.png"/>
    <p>View and control remote terminals from your browser</p>
    <p><a href="https://cs01.github.io/termpair/">Documentation</a></p>
</div>

---

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

To learn more, check out the [documentation](https://cs01.github.io/termpair/)!
