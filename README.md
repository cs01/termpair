<div style="text-align: center">
    <img src="https://github.com/cs01/termpair/raw/master/termpair/frontend_src/src/logo.png"/>
    <p>View and control remote terminals from your browser with end-to-end encryption</p>
</div>


**Try It**: [https://chadsmith.dev/termpair](https://chadsmith.dev/termpair)

<p align="center">
<a href="https://badge.fury.io/py/termpair"><img src="https://badge.fury.io/py/termpair.svg" alt="PyPI version" height="18"></a>

<a href="https://github.com/cs01/termpair/actions?query=workflow%3Atests">
<img src="https://github.com/cs01/termpair/actions/workflows/tests.yml/badge.svg?branch=master" alt="PyPI version" height="18"></a>
</p>


## What is TermPair?

TermPair lets developers securely share and control terminals in real time.

<div style="text-align: center">
   <a href="https://github.com/cs01/termpair/raw/master/termpair_browser.gif"> <img src="https://github.com/cs01/termpair/raw/master/termpair_browser.gif"/></a>
</div>

## Usage

First start the TermPair server with `termpair serve`, or use the one already running at [https://chadsmith.dev/termpair](https://chadsmith.dev/termpair).

The server is used to route encrypted data between terminals and connected browsers — it doesn't actually start sharing any terminals just by running it.

```
> termpair serve --port 8000
INFO:     Started server process [25289]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://localhost:8000 (Press CTRL+C to quit)
INFO:     ('127.0.0.1', 51924) - "WebSocket /connect_to_terminal" [accepted]
```

Now that you have the server running, you can share your terminal by running `termpair share`.

This connects your terminal to the server, and allows browsers to access the terminal through the server.

```
> termpair share
---------------------------------------------------------------------------------------------------------------------------------
Connection established with end-to-end encryption 🔒
Terminal ID: e8add1d61a63599b91c0f5ba8779319d
TermPair Server URL: http://localhost:8000/
Sharable link (expires when this process ends):
  http://localhost:8000/?terminal_id=e8add1d61a63599b91c0f5ba8779319d
Type 'exit' or close terminal to stop sharing.
---------------------------------------------------------------------------------------------------------------------------------
```

The URL printed contains a unique terminal ID. You can share the URL with whoever you like. **Anyone who has it can access your terminal while the `termpair share` process is running.**

The server multicasts terminal output to all browsers that connect to the session.

## Security

TermPair uses end-to-end encryption for all terminal input and output, meaning the server *never* has access to the raw input or output of the terminal.

The browser must be running in a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts). This typically means running with secure http traffic (https) or on localhost.

## How it Works

<div style="text-align: center">
    <a href="https://github.com/cs01/termpair/raw/master/docs/termpair_architecture.png">
    <img src="https://github.com/cs01/termpair/raw/master/docs/termpair_architecture.png"/></a>
</div>

TermPair consists of three pieces:

1. terminal client
2. server
3. browser client(s)

First, the termpair server is started (`termpair serve`). The server acts as a router that blindly forwards encrypted data between TermPair terminal clients and connected browsers. The server listens for termpair websocket connections from unix terminal clients, and maintains a mapping to any connected browsers.

Before the TermPair client sends terminal output to the server, it creates two 128 bit AES encryption keys. One is used to encrypt the terminal's output to the browsers so the server cannot read it. The other is used by the browser when sending input from the browser to the terminal.

The server then forwards that terminal data to connected browsers. When the browsers receive the data, they use the secret key to decrypt and display the terminal output.

The browser obtains the secret AES keys without the server seeing them by using public key encryption. The browser generates an RSA key pair at runtime, then sends the public key to the broadcasting terminal. The broadcasting terminal responds with the AES keys encrypted with the public key.

Both AES keys get rotated after either key has sent 2^20 (1048576) messages. The AES initialization vector (IV) values increment monotonically to ensure they are never reused.

When a browser sends input to the terminal, it is encrypted in the browser, forwarded from the server to the terminal, then decrypted in the terminal by TermPair, and finally written to the terminal's input.


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

Note: pipx caches installations for a few days. To ignore the cache and force a fresh installation, use `pipx run --no-cache termpair ...`.

## Installation

You can install using [pipx](https://github.com/pipxproject/pipx):

```
> pipx install termpair
```

or install with [pip](https://pip.pypa.io/en/stable/)

```
> pip install termpair
```

## Serving with NGINX
Running behind an nginx proxy can be done with the following configuration.

The TermPair server must be started with `termpair serve`, and the port being run on must be specified in the `upstream` configuration.

```nginx
upstream termpair_app {
  # Make sure the port matches the port you are running on
  server 127.0.0.1:8000;
}

server {
    server_name myserver.com;

    # I recommend Certbot if you don't have SSL set up
    listen 443 ssl;
    ssl_certificate fullchain.pem;
    ssl_certificate_key privkey.pem;

    location /termpair/ {
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;

        proxy_pass http://termpair_app/;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Static Hosting
As an optional additional security measure, TermPair supports staticallly serving the JavaScript web app. In this arrangement, you can build the webapp yourself and host on your computer, or statically host on something like GitHub pages or Vercel. That way you can guarantee the server is not providing a malicious JavaScript web app.

Then, you can connect to it and specify the Terminal ID and TermPair server that routes the encrypted data.

To build the web app, see [CONTRIBUTING.md](https://github.com/cs01/termpair/blob/master/CONTRIBUTING.md). You can try the one being served at [https://cs01.github.io/termpair/site/connect/](https://cs01.github.io/termpair/site/connect/).

Then you can deploy to GitHub pages, Vercel, etc. or self-serve with
```shell
$ cd termpair/termpair/frontend_build
$ python3 -m http.server 7999 --bind 127.0.0.1
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
- To run the server, `termpair serve`: Tested on Linux and macOS. Likely works on Windows.
- To share your terminal, `termpair share`: Tested on Linux and macOS. Likely does not work on Windows.
