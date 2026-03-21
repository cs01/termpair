use std::ffi::CString;
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL;
use futures_util::{SinkExt, StreamExt};
use nix::libc;
use nix::sys::termios;
use rand::RngCore;
use serde_json::json;
use tokio::sync::mpsc;

use crate::constants::{MAX_READ_BYTES, SUBPROTOCOL_VERSION};
use crate::share::aes_keys::AesKeys;

struct RawModeGuard {
    fd: OwnedFd,
    original: termios::Termios,
}

impl RawModeGuard {
    fn new(raw_fd: i32) -> Result<Self, String> {
        let dup_fd = unsafe { libc::dup(raw_fd) };
        if dup_fd < 0 { return Err("dup failed".into()); }
        let fd = unsafe { OwnedFd::from_raw_fd(dup_fd) };
        let original =
            termios::tcgetattr(&fd).map_err(|e| format!("tcgetattr failed: {}", e))?;
        let mut raw = original.clone();
        termios::cfmakeraw(&mut raw);
        termios::tcsetattr(&fd, termios::SetArg::TCSANOW, &raw)
            .map_err(|e| format!("tcsetattr failed: {}", e))?;
        Ok(Self { fd, original })
    }
}

impl Drop for RawModeGuard {
    fn drop(&mut self) {
        let _ = termios::tcsetattr(&self.fd, termios::SetArg::TCSAFLUSH, &self.original);
    }
}

fn get_terminal_size(fd: i32) -> (u16, u16) {
    unsafe {
        let mut ws: libc::winsize = std::mem::zeroed();
        if libc::ioctl(fd, libc::TIOCGWINSZ, &mut ws) == 0 {
            (ws.ws_row, ws.ws_col)
        } else {
            (24, 80)
        }
    }
}

fn set_terminal_size(fd: i32, rows: u16, cols: u16) {
    unsafe {
        let ws = libc::winsize {
            ws_row: rows,
            ws_col: cols,
            ws_xpixel: 0,
            ws_ypixel: 0,
        };
        libc::ioctl(fd, libc::TIOCSWINSZ, &ws);
    }
}

fn raw_write(fd: i32, buf: &[u8]) {
    unsafe { libc::write(fd, buf.as_ptr() as *const _, buf.len()); }
}

fn raw_read(fd: i32, buf: &mut [u8]) -> isize {
    unsafe { libc::read(fd, buf.as_mut_ptr() as *mut _, buf.len()) }
}

fn set_nonblocking(fd: i32) -> Result<(), String> {
    unsafe {
        let flags = libc::fcntl(fd, libc::F_GETFL);
        if flags < 0 {
            return Err("fcntl F_GETFL failed".into());
        }
        if libc::fcntl(fd, libc::F_SETFL, flags | libc::O_NONBLOCK) < 0 {
            return Err("fcntl F_SETFL O_NONBLOCK failed".into());
        }
    }
    Ok(())
}

pub async fn broadcast_terminal(
    cmd: Vec<String>,
    url: String,
    allow_browser_control: bool,
    open_browser: bool,
) -> Result<(), String> {
    let mut master_fd: i32 = 0;
    let child_pid = unsafe {
        let pid = libc::forkpty(
            &mut master_fd as *mut _,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        );
        if pid < 0 {
            return Err("forkpty failed".into());
        }
        pid
    };

    if child_pid == 0 {
        let cmd_cstr =
            CString::new(cmd[0].as_str()).map_err(|e| format!("invalid command: {}", e))?;
        let args_cstr: Vec<CString> = cmd
            .iter()
            .map(|a| CString::new(a.as_str()).unwrap())
            .collect();

        unsafe {
            libc::setenv(
                b"TERMPAIR_BROADCASTING\0".as_ptr() as *const _,
                b"1\0".as_ptr() as *const _,
                1,
            );
            let val = if allow_browser_control { b"1\0" } else { b"0\0" };
            libc::setenv(
                b"TERMPAIR_BROWSERS_CAN_CONTROL\0".as_ptr() as *const _,
                val.as_ptr() as *const _,
                1,
            );
        }

        nix::unistd::execvp(&cmd_cstr, &args_cstr)
            .map_err(|e| format!("execvp failed: {}", e))?;
        unreachable!()
    }

    let master = unsafe { OwnedFd::from_raw_fd(master_fd) };
    run_parent(master, cmd, url, allow_browser_control, open_browser).await
}

async fn run_parent(
    master: OwnedFd,
    cmd: Vec<String>,
    url: String,
    allow_browser_control: bool,
    open_browser: bool,
) -> Result<(), String> {
    let pty_fd = master.as_raw_fd();
    let stdin_fd = std::io::stdin().as_raw_fd();

    let (stdin_rows, stdin_cols) = get_terminal_size(stdin_fd);
    set_terminal_size(pty_fd, stdin_rows, stdin_cols);

    let ws_url = url.replace("http", "ws");
    let ws_endpoint = format!("{}connect_to_terminal", ws_url);

    let (ws_stream, _) = tokio_tungstenite::connect_async(&ws_endpoint)
        .await
        .map_err(|e| {
            format!(
                "connection refused. is the termpair server running? {}",
                e
            )
        })?;

    let (mut ws_tx, mut ws_rx) = ws_stream.split();

    let mut aes_keys = AesKeys::new();
    let mut num_browsers: u64 = 0;

    let (rows, cols) = get_terminal_size(stdin_fd);
    let now = chrono::Utc::now().to_rfc3339();
    let init_msg = json!({
        "rows": rows,
        "cols": cols,
        "allow_browser_control": allow_browser_control,
        "command": cmd.join(" "),
        "broadcast_start_time_iso": now,
        "subprotocol_version": SUBPROTOCOL_VERSION,
    });

    ws_tx
        .send(tokio_tungstenite::tungstenite::Message::Text(
            init_msg.to_string().into(),
        ))
        .await
        .map_err(|e| format!("failed to send init: {}", e))?;

    let resp = ws_rx
        .next()
        .await
        .ok_or("no response from server")?
        .map_err(|e| format!("ws error: {}", e))?;

    let resp_text = resp
        .into_text()
        .map_err(|e| format!("invalid response: {}", e))?;
    let resp_json: serde_json::Value =
        serde_json::from_str(&resp_text).map_err(|e| format!("invalid json: {}", e))?;

    let event = resp_json["event"].as_str().unwrap_or("");
    if event == "fatal_error" {
        return Err(format!(
            "fatal error: {}",
            resp_json["payload"].as_str().unwrap_or("unknown")
        ));
    }
    if event != "start_broadcast" {
        return Err(format!("unexpected event: {}", event));
    }

    let terminal_id = resp_json["payload"]
        .as_str()
        .ok_or("missing terminal_id")?
        .to_string();

    let secret_key_b64url = BASE64URL.encode(&aes_keys.bootstrap_key);
    let share_url = format!("{}s/{}#{}", url, terminal_id, secret_key_b64url);
    let public_url = format!("{}s/{}", url, terminal_id);

    let dashes: String = "-".repeat(cols as usize);
    eprintln!("{}", dashes);
    eprintln!(
        "\x1b[1m\x1b[0;32mConnection established with end-to-end encryption\x1b[0m"
    );
    eprintln!();
    eprintln!("Shareable link (full):  {}", share_url);
    eprintln!("Public viewer link:     {}", public_url);
    eprintln!("Secret key:             {}", secret_key_b64url);
    eprintln!();
    eprintln!("Type 'exit' or close terminal to stop sharing.");
    eprintln!("{}", dashes);

    if open_browser {
        let _ = open::that(&share_url);
    }

    let _raw_guard =
        RawModeGuard::new(stdin_fd).map_err(|e| format!("failed to set raw mode: {}", e))?;

    let (outgoing_tx, mut outgoing_rx) = mpsc::channel::<String>(256);

    let pty_fd_dup = unsafe {
        let fd = libc::dup(pty_fd);
        if fd < 0 { return Err("dup failed".into()); }
        OwnedFd::from_raw_fd(fd)
    };
    set_nonblocking(pty_fd_dup.as_raw_fd())?;

    let outgoing_tx_pty = outgoing_tx.clone();
    let stdout_fd = std::io::stdout().as_raw_fd();
    let pty_read_task = tokio::spawn(async move {
        let async_fd = match tokio::io::unix::AsyncFd::new(pty_fd_dup) {
            Ok(fd) => fd,
            Err(e) => {
                tracing::error!("AsyncFd pty failed: {}", e);
                return;
            }
        };
        let mut buf = vec![0u8; MAX_READ_BYTES];
        loop {
            let mut ready = match async_fd.readable().await {
                Ok(r) => r,
                Err(_) => break,
            };

            match ready.try_io(|fd| {
                let n = raw_read(fd.as_raw_fd(), &mut buf);
                if n < 0 {
                    Err(std::io::Error::last_os_error())
                } else {
                    Ok(n as usize)
                }
            }) {
                Ok(Ok(0)) => break,
                Ok(Ok(n)) => {
                    let output = &buf[..n];
                    raw_write(stdout_fd, output);

                    let mut salt = [0u8; 12];
                    rand::thread_rng().fill_bytes(&mut salt);
                    let plaintext = json!({
                        "pty_output": BASE64.encode(output),
                        "salt": BASE64.encode(&salt),
                    });
                    let plaintext_bytes = plaintext.to_string().into_bytes();

                    let _ = outgoing_tx_pty
                        .send(format!("__pty_raw:{}", BASE64.encode(&plaintext_bytes)))
                        .await;
                }
                Ok(Err(_)) => break,
                Err(_) => continue,
            }
        }
    });

    let stdin_fd_dup = unsafe {
        let fd = libc::dup(stdin_fd);
        if fd < 0 { return Err("dup stdin failed".into()); }
        OwnedFd::from_raw_fd(fd)
    };
    set_nonblocking(stdin_fd_dup.as_raw_fd())?;

    let stdin_task = tokio::spawn(async move {
        let async_fd = match tokio::io::unix::AsyncFd::new(stdin_fd_dup) {
            Ok(fd) => fd,
            Err(e) => {
                tracing::error!("AsyncFd stdin failed: {}", e);
                return;
            }
        };
        let mut buf = vec![0u8; MAX_READ_BYTES];
        loop {
            let mut ready = match async_fd.readable().await {
                Ok(r) => r,
                Err(_) => break,
            };
            match ready.try_io(|fd| {
                let n = raw_read(fd.as_raw_fd(), &mut buf);
                if n < 0 {
                    Err(std::io::Error::last_os_error())
                } else {
                    Ok(n as usize)
                }
            }) {
                Ok(Ok(0)) => break,
                Ok(Ok(n)) => {
                    raw_write(pty_fd, &buf[..n]);
                }
                Ok(Err(_)) => break,
                Err(_) => continue,
            }
        }
    });

    let outgoing_tx_sigwinch = outgoing_tx.clone();
    let mut sigwinch =
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::window_change())
            .map_err(|e| format!("signal handler failed: {}", e))?;
    let sigwinch_task = tokio::spawn(async move {
        while sigwinch.recv().await.is_some() {
            let (rows, cols) = get_terminal_size(stdin_fd);
            set_terminal_size(pty_fd, rows, cols);
            let msg = json!({"event": "resize", "payload": {"rows": rows, "cols": cols}});
            let _ = outgoing_tx_sigwinch.send(msg.to_string()).await;
        }
    });

    let outgoing_tx_ws_recv = outgoing_tx.clone();
    let ws_recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_rx.next().await {
            if let Ok(text) = msg.into_text() {
                let _ = outgoing_tx_ws_recv
                    .send(format!("__from_browser:{}", text))
                    .await;
            }
        }
    });

    let main_loop_task = tokio::spawn(async move {
        while let Some(msg) = outgoing_rx.recv().await {
            if let Some(raw_b64) = msg.strip_prefix("__pty_raw:") {
                if let Ok(plaintext_bytes) = BASE64.decode(raw_b64) {
                    match aes_keys.encrypt(&plaintext_bytes) {
                        Ok(encrypted) => {
                            let ws_msg = json!({
                                "event": "new_output",
                                "payload": BASE64.encode(&encrypted),
                            });
                            if ws_tx
                                .send(tokio_tungstenite::tungstenite::Message::Text(
                                    ws_msg.to_string().into(),
                                ))
                                .await
                                .is_err()
                            {
                                break;
                            }
                            if aes_keys.need_rotation() {
                                if let Ok(rotation_msg) = aes_keys.rotate_keys() {
                                    let _ = ws_tx
                                        .send(tokio_tungstenite::tungstenite::Message::Text(
                                            rotation_msg.into(),
                                        ))
                                        .await;
                                }
                            }
                        }
                        Err(e) => {
                            tracing::error!("encryption error: {}", e);
                        }
                    }
                }
            } else if let Some(browser_msg) = msg.strip_prefix("__from_browser:") {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(browser_msg) {
                    let event = parsed["event"].as_str().unwrap_or("");
                    match event {
                        "command" => {
                            if allow_browser_control {
                                if let Some(payload) = parsed["payload"].as_str() {
                                    if let Ok(encrypted_bytes) = BASE64.decode(payload) {
                                        if let Ok(decrypted) =
                                            aes_keys.decrypt(&encrypted_bytes)
                                        {
                                            if let Ok(data) = serde_json::from_slice::<
                                                serde_json::Value,
                                            >(
                                                &decrypted
                                            ) {
                                                if let Some(input) = data["data"].as_str() {
                                                    raw_write(pty_fd, input.as_bytes());
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        "request_terminal_dimensions" => {
                            let (rows, cols) = get_terminal_size(stdin_fd);
                            set_terminal_size(pty_fd, rows, cols);
                            let resize_msg = json!({"event": "resize", "payload": {"rows": rows, "cols": cols}});
                            let _ = ws_tx
                                .send(tokio_tungstenite::tungstenite::Message::Text(
                                    resize_msg.to_string().into(),
                                ))
                                .await;
                        }
                        "request_key_rotation" => {
                            if let Ok(rotation_msg) = aes_keys.rotate_keys() {
                                let _ = ws_tx
                                    .send(tokio_tungstenite::tungstenite::Message::Text(
                                        rotation_msg.into(),
                                    ))
                                    .await;
                            }
                        }
                        "new_browser_connected" => {
                            num_browsers += 1;
                            if let Ok(keys_msg) =
                                aes_keys.build_aes_keys_message(num_browsers)
                            {
                                let _ = ws_tx
                                    .send(tokio_tungstenite::tungstenite::Message::Text(
                                        keys_msg.into(),
                                    ))
                                    .await;
                            }
                        }
                        "fatal_error" => {
                            let payload = parsed["payload"].as_str().unwrap_or("unknown");
                            tracing::error!("fatal error from server: {}", payload);
                            break;
                        }
                        _ => {}
                    }
                }
            } else if ws_tx
                .send(tokio_tungstenite::tungstenite::Message::Text(msg.into()))
                .await
                .is_err()
            {
                break;
            }
        }
    });

    tokio::select! {
        _ = pty_read_task => {},
        _ = main_loop_task => {},
        _ = ws_recv_task => {},
    }

    stdin_task.abort();
    sigwinch_task.abort();

    // reset terminal modes that xterm.js may have enabled (focus reporting, etc.)
    eprint!("\x1b[?1004l\x1b[?1049l\x1b[?25h");

    eprintln!(
        "You are no longer broadcasting terminal id {}",
        terminal_id
    );
    Ok(())
}
