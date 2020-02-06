<div style="text-align: center">
    <img src="https://github.com/cs01/termpair/raw/master/termpair/frontend_src/src/logo.png"/>
    <p>View and control remote terminals from your browser</p>

</div>

**Documentation**: https://cs01.github.io/termpair

**Source Code**: https://github.com/cs01/termpair

## <a href="https://badge.fury.io/py/termpair"><img src="https://badge.fury.io/py/termpair.svg" alt="PyPI version" height="18"></a>

## What is TermPair?

TermPair lets developers share and control terminals in real time.

<div style="text-align: center">
   <a href="https://github.com/cs01/termpair/raw/master/termpair_browser.gif"> <img src="https://github.com/cs01/termpair/raw/master/termpair_browser.gif"/></a>
</div>

## Usage

Start the TermPair server:

```
>> termpair serve
INFO:     Started server process [15455]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://localhost:8000 (Press CTRL+C to quit)
INFO:     ('127.0.0.1', 35470) - "WebSocket /connect_to_terminal" [accepted]
```

Then share your terminal by running:

```
>> termpair share -a
--------------------------------------------------------------------------------
Running '/bin/bash' and sharing to 'http://localhost:8000/?terminal_id=b26903e19ffff2bc9ace60491e8200d5'.
Type 'exit' or close terminal to stop sharing.
--------------------------------------------------------------------------------
```

You can share that URL with whoever you want. Note that anyone that has it can view and possible control your terminal.

The server multicasts terminal output to as many browsers that connect to the session.

## Installation

Use [pipx](https://github.com/pipxproject/pipx) to run the latest version without installing:

```
>> pipx run termpair serve
>> pipx run termpair share -b
```

You can also install using [pipx](https://github.com/pipxproject/pipx) or pip:

```
>> pipx install termpair
```

or

```
>> pip install termpair
```

## API

To view the command line API reference, run:

```
>> termpair --help
```

## System Requirements

Python: 3.6+

Operating System:

- To view/control from the browser: All operating systems are supported.
- To run the server, `termpair serve`: Tested on Linux. Should work on macOS. Might work on Windows.
- To share your terminal, `termpair share`: Tested on Linux. Should work on macOS. Probably doesn't work on Windows.
