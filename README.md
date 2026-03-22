<p align="center">
<img src="https://github.com/cs01/termpair/raw/main/termpair/frontend_src/src/logo.png"/>
<br>
View and control remote terminals from your browser with end-to-end encryption
<br><br>
<a href="https://github.com/cs01/termpair/actions/workflows/ci.yml">
<img src="https://github.com/cs01/termpair/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
</p>

> Originally written in Python, rewritten in Rust for single-binary distribution.

<p align="center">
<a href="https://github.com/cs01/termpair/raw/main/termpair_browser.gif">
<img src="https://github.com/cs01/termpair/raw/main/termpair_browser.gif"/></a>
</p>

## Features

* End-to-end encrypted with AES-128-GCM -- the server never sees plaintext
* Share terminals in real time (Linux, macOS, Windows)
* Type from the terminal or browser; both are kept in sync
* Multiple browsers can connect simultaneously
* Read-only or read-write browser permissions
* Single static binary with frontend embedded, no runtime dependencies
* Terminal dimensions synced to the browser in real time

## Installation

### Quick Install

```
curl -fsSL https://raw.githubusercontent.com/cs01/termpair/main/install.sh | sh
```

Installs the latest binary to `/usr/local/bin`. Customize with environment variables:

```
INSTALL_DIR=~/.local/bin sh     # custom install directory
VERSION=v0.5.0 sh               # specific version
```

### GitHub Releases

Download a prebuilt binary from the [releases page](https://github.com/cs01/termpair/releases). Available for Linux (x86_64, aarch64), macOS (x86_64, Apple Silicon), and Windows (x86_64).

### Build from Source

```
git clone https://github.com/cs01/termpair.git
cd termpair/termpair-rs
cargo build --release
cp target/release/termpair /usr/local/bin/
```

## Usage

Start the server:

```
termpair serve
```

Share your terminal:

```
termpair share
```

This prints a URL containing a unique terminal ID and encryption key. Share it with whoever you want to give access. **Anyone with the link can access your terminal** while the session is running.

By default, `termpair share` runs your `$SHELL`. The server multicasts terminal output to all connected browsers.

## How it Works

```
┌─────────────────┐                                    ┌─────────────────┐
│                 │    encrypted terminal output        │                 │
│  Terminal       │───────────────────────────────────▶│  Browser(s)     │
│  (termpair      │         ┌───────────────┐          │  (xterm.js +    │
│   share)        │◀────────│  Server       │─────────▶│   Web Crypto)   │
│                 │         │  (blind relay) │          │                 │
│  - forks pty    │    encrypted browser input          │  - decrypts     │
│  - encrypts I/O │         │  never sees   │          │    output       │
│  - manages keys │         │  plaintext    │          │  - encrypts     │
│                 │         └───────────────┘          │    input        │
└─────────────────┘                                    └─────────────────┘
```

The server is a blind relay -- it routes encrypted WebSocket messages without access to keys or plaintext.
The terminal client forks a pty, encrypts all output with AES-128-GCM, and decrypts browser input.
Browsers decrypt and render with [xterm.js](https://xtermjs.org/) + [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API).

### Encryption

Three AES-128-GCM keys are created per session:

1. **Output key** -- encrypts terminal output before sending to the server
2. **Input key** -- encrypts browser input before sending to the server
3. **Bootstrap key** -- delivered via the [URL hash fragment](https://developer.mozilla.org/en-US/docs/Web/API/HTMLAnchorElement/hash) (never sent to the server), used to securely exchange keys #1 and #2

Keys are rotated after 2^20 messages. IVs are monotonic counters to prevent reuse.

The browser must be in a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) (HTTPS or localhost).

## Deployment

### NGINX

```nginx
upstream termpair_app {
  server 127.0.0.1:8000;
}

server {
    server_name myserver.com;
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

### systemd

```ini
# /etc/systemd/system/termpair.service
[Unit]
Description=TermPair terminal sharing server
After=network.target

[Service]
ExecStart=/usr/local/bin/termpair serve --port 8000
Restart=on-failure
RestartSec=1s

[Install]
WantedBy=multi-user.target
```

```
sudo systemctl daemon-reload
sudo systemctl enable termpair.service
sudo systemctl restart termpair
```

### TLS

Generate a self-signed certificate:

```
openssl req -newkey rsa:2048 -nodes -keyout host.key -x509 -days 365 -out host.crt -batch
```

Then pass it to the server:

```
termpair serve --certfile host.crt --keyfile host.key
```

## CLI Reference

```
$ termpair serve [OPTIONS]
  -p, --port <PORT>          port to listen on [default: 8000]
      --host <HOST>          host to bind to [default: localhost]
  -c, --certfile <CERTFILE>  path to SSL certificate for HTTPS
  -k, --keyfile <KEYFILE>    path to SSL private key for HTTPS

$ termpair share [OPTIONS]
      --cmd <CMD>     command to run [default: $SHELL]
  -p, --port <PORT>   server port [default: 8000]
      --host <HOST>   server URL [default: http://localhost]
  -r, --read-only     prevent browsers from typing
  -b, --open-browser  open the share link in a browser
```
