<div style="text-align: center; font-size: 1.5em;">
    <img src="https://github.com/cs01/termpair/raw/main/termpair/frontend_src/src/logo.png"/>
    <p>View and control remote terminals from your browser with end-to-end encryption</p>
<p align="center">
<a href="https://github.com/cs01/termpair/actions/workflows/ci.yml">
<img src="https://github.com/cs01/termpair/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" height="18"></a>
</p>
</div>

> Originally written in Python, rewritten in Rust for single-binary distribution.

## What is TermPair?

TermPair lets developers securely share and control terminals in real time.

You can **try it now** at [https://chadsmith.dev/termpair](https://chadsmith.dev/termpair) or **check out the [YouTube Demo](https://www.youtube.com/watch?v=HF0UX4smrKk)**.
<div style="text-align: center">
   <a href="https://github.com/cs01/termpair/raw/main/termpair_browser.gif"> <img src="https://github.com/cs01/termpair/raw/main/termpair_browser.gif"/></a>
</div>

## Features
* Share unix terminals in real time
* Type from the terminal or browser; both are kept in sync
* Multiple browsers can connect simultaneously
* Browser permissions can be read/write or read only
* Server cannot read terminal data even if it wanted to, since it is encrypted with AES 128 bit encryption
* Secure web environment required (https)
* Single static binary with frontend embedded -- no separate web server needed
* Broadcasting terminal's dimensions are sent to the browser in realtime so rendering always matches
* Single static binary with no runtime dependencies

## Usage

First start the TermPair server with `termpair serve`, or use the one already running at [https://chadsmith.dev/termpair](https://chadsmith.dev/termpair).

The server is used to route encrypted data between terminals and connected browsers -- it doesn't actually start sharing any terminals on its own.

```
termpair serve
```

Now that you have the server running, you can share your terminal by running `termpair share`.

This connects your terminal to the server, and allows browsers to access the terminal through the server.

```
termpair share
--------------------------------------------------------------------------------
Connection established with end-to-end encryption

Shareable link: http://localhost:8000/?terminal_id=d58ff4eed5aa9425e944abe63214382e#g8hSgHnDaBtiWKTeH4I0Ow==

Terminal ID: d58ff4eed5aa9425e944abe63214382e
Secret encryption key: g8hSgHnDaBtiWKTeH4I0Ow==
TermPair Server URL: http://localhost:8000/

Type 'exit' or close terminal to stop sharing.
--------------------------------------------------------------------------------
```

The URL printed contains a unique terminal ID and encryption key. You can share the URL with whoever you like. **Anyone who has it can access your terminal while the `termpair share` process is running,** so be sure you trust the person you are sharing the link with.

By default, the process that is shared is a new process running the current shell, determined by the `$SHELL` environment variable.

The server multicasts terminal output to all browsers that connect to the session.

## System Requirements

Operating Systems: Linux, macOS

## Installation

### Quick Install (recommended)

```
curl -fsSL https://raw.githubusercontent.com/cs01/termpair/main/install.sh | sh
```

This detects your platform and installs the latest binary to `/usr/local/bin`.

To install to a different directory:

```
curl -fsSL https://raw.githubusercontent.com/cs01/termpair/main/install.sh | INSTALL_DIR=~/.local/bin sh
```

To install a specific version:

```
curl -fsSL https://raw.githubusercontent.com/cs01/termpair/main/install.sh | VERSION=v0.5.0 sh
```

### Download from GitHub Releases

Download a prebuilt binary for your platform from the [releases page](https://github.com/cs01/termpair/releases).

Available platforms: Linux (x86_64, aarch64), macOS (x86_64, Apple Silicon).

### Build from Source

```
git clone https://github.com/cs01/termpair.git
cd termpair/termpair-rs
cargo build --release
cp target/release/termpair /usr/local/bin/
```

## Security

TermPair uses end-to-end encryption for all terminal input and output, meaning the server *never* has access to the raw input or output of the terminal, nor does it have access to encryption keys (other than the https connection).

The browser must be running in a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts). This typically means running with secure http traffic (https) or on localhost.

### Building from Source
For extra assurance the source code is secure, you can build and run from source.
See [CONTRIBUTING.md](https://github.com/cs01/termpair/blob/main/CONTRIBUTING.md) for more information.

## How it Works

<div style="text-align: center">
    <a href="https://github.com/cs01/termpair/raw/main/docs/termpair_architecture.png">
    <img src="https://github.com/cs01/termpair/raw/main/docs/termpair_architecture.png"/></a>
</div>

TermPair consists of three pieces:

1. server
2. terminal client
3. JavaScript web app running in browser client(s)

### Server
First, the termpair server is started (`termpair serve`). The server acts as a router that blindly forwards encrypted data between TermPair terminal clients and connected browsers. The server listens for termpair websocket connections from unix terminal clients, and maintains a mapping to any connected browsers.

### Terminal Client
When a user wants to share their terminal, they run `termpair share` to start the client. The TermPair client registers this session with the server, then forks a pseudo-terminal (pty) with the desired process, usually a shell like `bash` or `zsh`. TermPair reads data from the pty's file descriptor as it becomes available, then writes it to the real terminal's stdout, where it is printed like normal. It also encrypts this output and sends it to the server via a websocket.

### Encryption
The TermPair client creates three 128 bit AES encryption keys when it starts:
* The first is used to encrypt the terminal's output before sending it to the server.
* The second is used by the browser before sending user input to the server.
* The third is a "bootstrap" key used by the browser to decrypt the initial connection response from the broadcasting terminal, which contains the above two keys encrypted with this third key. The browser obtains this bootstrap key via a [part of the url](https://developer.mozilla.org/en-US/docs/Web/API/HTMLAnchorElement/hash) that the server does not have access to, or via manual user input. A public key exchange like Diffie-Hellman was not used since multiple browsers can connect to the terminal, which would increase the complexity of TermPair's codebase. Still, DH in some form may be considered in the future.

### Web App
The TermPair client provides the user with a unique URL for the duration of the sharing session. That URL points to the TermPair web application that sets up a websocket connection to receive and send the encrypted terminal data. When data is received, it is decrypted and written to a browser-based terminal.

When a user types in the browser's terminal, it is encrypted in the browser with key #2, sent to the server, forwarded from the server to the terminal, then decrypted in the terminal by TermPair. Finally, the TermPair client writes it to the pty's file descriptor, as if it were being typed directly to the terminal.

AES keys #1 and #2 get rotated after either key has sent 2^20 (1048576) messages. The AES initialization vector (IV) values increment monotonically to ensure they are never reused.

## Serving with NGINX
Running behind an nginx proxy can be done with the following configuration.

The TermPair server must be started already. This is usually done as a [systemd service](#running-as-a-systemd-service). The port being run on must be specified in the `upstream` configuration.

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

## Running as a systemd service
If you use systemd to manage services, here is an example configuration you can start with.

This configuration assumes you've installed TermPair to `/usr/local/bin/termpair` and saved the file to `/etc/systemd/system/termpair.service`.

```toml
# /etc/systemd/system/termpair.service

# https://www.freedesktop.org/software/systemd/man/systemd.service.html
[Unit]
Description=TermPair terminal sharing server
After=network.target

[Service]
User=$USER
Group=www-data
WorkingDirectory=/var/www/termpair/
PermissionsStartOnly=true
ExecStart=/usr/local/bin/termpair serve --port 8000
ExecStop=
Restart=on-failure
RestartSec=1s

[Install]
WantedBy=multi-user.target
```

After saving, you can use `systemctl` to start your `systemd` service:
```
sudo systemctl daemon-reload
sudo systemctl enable termpair.service
sudo systemctl restart termpair
```

## CLI API

### termpair

```
View and control remote terminals from your browser

Usage: termpair <COMMAND>

Commands:
  serve   Run termpair server to route messages between terminals and browsers
  share   Share your terminal session with one or more browsers

Options:
  -h, --help     Print help
  -V, --version  Print version
```

### termpair serve

```
Run termpair server to route messages between terminals and browsers

Usage: termpair serve [OPTIONS]

Options:
  -p, --port <PORT>          Port to listen on [default: 8000]
      --host <HOST>          Host to bind to (use 0.0.0.0 to expose publicly) [default: localhost]
  -c, --certfile <CERTFILE>  Path to SSL certificate (.crt) for HTTPS
  -k, --keyfile <KEYFILE>    Path to SSL private key (.key) for HTTPS
  -h, --help                 Print help
```

### termpair share

```
Share your terminal session with one or more browsers

Usage: termpair share [OPTIONS]

Options:
      --cmd <CMD>    Command to run in the shared terminal [default: $SHELL]
  -p, --port <PORT>  Port the server is running on [default: 8000]
      --host <HOST>  URL of the termpair server [default: http://localhost]
  -r, --read-only    Prevent browser viewers from typing
  -b, --open-browser Automatically open the share link in a browser
  -h, --help         Print help
```
