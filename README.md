<div style="text-align: center">
    <img src="https://github.com/cs01/termpair/raw/master/termpair/frontend_src/src/logo.png"/>
    <p>View and control remote terminals from your browser with end-to-end encryption</p>
</div>

**Documentation**: [https://cs01.github.io/termpair](https://cs01.github.io/termpair)

**Source Code**: [https://github.com/cs01/termpair](https://github.com/cs01/termpair)

**Try It**: [https://grassfedcode.com/termpair](https://grassfedcode.com/termpair)

## <a href="https://badge.fury.io/py/termpair"><img src="https://badge.fury.io/py/termpair.svg" alt="PyPI version" height="18"></a>

## What is TermPair?

TermPair lets developers securely share and control terminals in real time.

<div style="text-align: center">
   <a href="https://github.com/cs01/termpair/raw/master/termpair_browser.gif"> <img src="https://github.com/cs01/termpair/raw/master/termpair_browser.gif"/></a>
</div>

## Usage

Start the TermPair server with `termpair serve`, or use the one already running at [https://grassfedcode.com/termpair](https://grassfedcode.com/termpair).

```
> termpair serve --port 8000
INFO:     Started server process [25289]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://localhost:8000 (Press CTRL+C to quit)
INFO:     ('127.0.0.1', 51924) - "WebSocket /connect_to_terminal" [accepted]
```

Then share your terminal by running `termpair share`:

```
> termpair share --port 8000
--------------------------------------------------------------------------------
Connection established with end-to-end encryption 🔒
Sharing '/bin/bash' at

http://localhost:8000/?terminal_id=fd96c0f84adc6be776872950e19caecc#GyMlK2LLTqvoyTNzJ+qwLg==

Type 'exit' or close terminal to stop sharing.
--------------------------------------------------------------------------------
```

You can share that URL with whoever you want. Note that anyone that has it can view and possibly control your terminal.

The server multicasts terminal output to all browsers that connect to the session.

## Security

TermPair uses 128 bit end-to-end encryption for all terminal input and output.

The browser must be running in a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts). This typically means running on localhost, or with secure http traffic (https).

## How it Works

<div style="text-align: center">
    <a href="https://github.com/cs01/termpair/raw/master/docs/termpair_architecture.png">
    <img src="https://github.com/cs01/termpair/raw/master/docs/termpair_architecture.png"/></a>
</div>

TermPair consists of three pieces:

1. terminal client
2. server
3. browser client(s)

First, the termpair server is started (`termpair serve`). The server acts as a router that blindly forwards encrypted data between TermPair terminal clients and connected browsers.

It listens for termpair websocket connections from unix terminal clients, and maintains a mapping to any connected browsers.

Before the TermPair client sends terminal output to the server, it encrypts it using a secret key so the server cannot read it. The server forwards that data to connected browsers. When the browsers receive the data, they use the secret key to decrypt and display the terminal output. The browser obtains the secret key via a [part of the url](https://developer.mozilla.org/en-US/docs/Web/API/HTMLHyperlinkElementUtils/hash) that is not sent to the server.

Likewise, when a browser sends input to the terminal, it is encrypted in the browser, forwarded from the server to the terminal, then decrypted in the terminal by TermPair, and finally written to the terminal's input.


## Run With Latest Version

Use [pipx](https://github.com/pipxproject/pipx) to run the latest version without installing:

Serve:
```
> pipx run termpair serve
```

Then share:
```
> pipx run termpair share --open-browser
```

## Installation

You can install using [pipx](https://github.com/pipxproject/pipx) or pip:

```
> pipx install termpair
```

or

```
> pip install termpair
```

## CLI API

```
> termpair --help
usage: termpair [-h] [--version] {share,serve} ...

View and control remote terminals from your browser

positional arguments:
  {share,serve}

optional arguments:
  -h, --help     show this help message and exit
  --version
```

To start the TermPair server:
```
> termpair serve --help
usage: termpair serve [-h] [--port PORT] [--host HOST] [--certfile CERTFILE]
                      [--keyfile KEYFILE]

Run termpair server to route messages between unix terminals and browsers. Run
this before connecting any clients. It is recommended to encrypt communication
by using SSL/TLS. To generate an SSL certificate and private key, run `openssl
req -newkey rsa:2048 -nodes -keyout host.key -x509 -days 365 -out host.crt`.
To skip questions and use defaults, add the `-batch` flag. You can ignore
warnings about self-signed certificates since you know you just made it. Then
use them, pass the '--certfile' and '--keyfile' arguments.

optional arguments:
  -h, --help            show this help message and exit
  --port PORT, -p PORT  Port to run the server on (default: 8000)
  --host HOST           Host to run the server on (0.0.0.0 exposes publicly)
                        (default: localhost)
  --certfile CERTFILE, -c CERTFILE
                        Path to SSL certificate file (commonly .crt extension)
                        (default: None)
  --keyfile KEYFILE, -k KEYFILE
                        Path to SSL private key .key file (commonly .key
                        extension) (default: None)
```

To share a terminal using the TermPair client:
```
> termpair share --help
usage: termpair share [-h] [--cmd CMD] [--port PORT] [--host HOST]
                      [--no-browser-control] [--open-browser]

Share your terminal session with one or more browsers. A termpair server must
be running before using this command.

optional arguments:
  -h, --help            show this help message and exit
  --cmd CMD             The command to run in this TermPair session. Defaults
                        to the SHELL environment variable (default: /bin/bash)
  --port PORT, -p PORT  port server is running on (default: None)
  --host HOST           host server is running on (default: http://localhost)
  --no-browser-control, -n
                        Do not allow browsers to control your terminal
                        remotely (default: False)
  --open-browser, -b    Open a browser tab to the terminal after you start
                        sharing (default: False)

```

## System Requirements

Python: 3.6+

Operating System:

- To view/control from the browser: All operating systems are supported.
- To run the server, `termpair serve`: Tested on Linux. Should work on macOS. Might work on Windows.
- To share your terminal, `termpair share`: Tested on Linux. Should work on macOS. Probably doesn't work on Windows.
