use base64::engine::general_purpose::STANDARD as BASE64;
use base64::engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL;
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde_json::json;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

use crate::constants::{MAX_COMMAND_INPUT_BYTES, MAX_READ_BYTES, SUBPROTOCOL_VERSION};
use crate::share::aes_keys::AesKeys;

const SENSITIVE_ENV_VARS: &[&str] = &[
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "GITHUB_TOKEN",
    "GH_TOKEN",
    "GITLAB_TOKEN",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "DATABASE_URL",
    "SECRET_KEY",
    "API_KEY",
    "API_SECRET",
    "STRIPE_API_KEY",
    "STRIPE_SECRET_KEY",
    "DATADOG_API_KEY",
    "HUGGINGFACE_TOKEN",
    "HF_TOKEN",
    "SLACK_TOKEN",
    "SLACK_BOT_TOKEN",
    "AZURE_CLIENT_SECRET",
    "AZURE_STORAGE_KEY",
    "GCP_SERVICE_ACCOUNT_KEY",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "NPM_TOKEN",
    "PYPI_TOKEN",
    "DOCKER_PASSWORD",
    "DOCKER_AUTH_CONFIG",
    "SENTRY_DSN",
    "TWILIO_AUTH_TOKEN",
    "SENDGRID_API_KEY",
    "CLOUDFLARE_API_TOKEN",
    "DO_API_TOKEN",
    "LINODE_TOKEN",
    "HEROKU_API_KEY",
    "NETLIFY_AUTH_TOKEN",
    "VERCEL_TOKEN",
    "SSH_PRIVATE_KEY",
    "GPG_PRIVATE_KEY",
    "ENCRYPTION_KEY",
    "JWT_SECRET",
    "SESSION_SECRET",
    "COOKIE_SECRET",
];

#[cfg(unix)]
mod raw_mode {
    use nix::sys::termios;
    use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};

    pub struct RawModeGuard {
        fd: OwnedFd,
        original: termios::Termios,
    }

    impl RawModeGuard {
        pub fn enter() -> Result<Self, String> {
            let stdin_fd = std::io::stdin().as_raw_fd();
            let dup_fd = unsafe { nix::libc::dup(stdin_fd) };
            if dup_fd < 0 {
                return Err("dup failed".into());
            }
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
}

#[cfg(windows)]
mod raw_mode {
    use winapi::shared::minwindef::DWORD;
    use winapi::um::consoleapi::{GetConsoleMode, SetConsoleMode};
    use winapi::um::processenv::GetStdHandle;
    use winapi::um::winbase::STD_INPUT_HANDLE;
    use winapi::um::wincon::{ENABLE_ECHO_INPUT, ENABLE_LINE_INPUT, ENABLE_PROCESSED_INPUT};

    pub struct RawModeGuard {
        handle: *mut winapi::ctypes::c_void,
        original: DWORD,
    }

    unsafe impl Send for RawModeGuard {}

    impl RawModeGuard {
        pub fn enter() -> Result<Self, String> {
            unsafe {
                let handle = GetStdHandle(STD_INPUT_HANDLE);
                let mut original: DWORD = 0;
                if GetConsoleMode(handle, &mut original) == 0 {
                    return Err("GetConsoleMode failed".into());
                }
                let raw =
                    original & !(ENABLE_ECHO_INPUT | ENABLE_LINE_INPUT | ENABLE_PROCESSED_INPUT);
                if SetConsoleMode(handle, raw) == 0 {
                    return Err("SetConsoleMode failed".into());
                }
                Ok(Self { handle, original })
            }
        }
    }

    impl Drop for RawModeGuard {
        fn drop(&mut self) {
            unsafe {
                SetConsoleMode(self.handle, self.original);
            }
        }
    }
}

fn get_terminal_size() -> (u16, u16) {
    #[cfg(unix)]
    {
        use std::os::fd::AsRawFd;
        unsafe {
            let mut ws: nix::libc::winsize = std::mem::zeroed();
            if nix::libc::ioctl(std::io::stdin().as_raw_fd(), nix::libc::TIOCGWINSZ, &mut ws) == 0 {
                return (ws.ws_row, ws.ws_col);
            }
        }
    }
    #[cfg(windows)]
    {
        unsafe {
            use winapi::um::processenv::GetStdHandle;
            use winapi::um::winbase::STD_OUTPUT_HANDLE;
            use winapi::um::wincon::{GetConsoleScreenBufferInfo, CONSOLE_SCREEN_BUFFER_INFO};
            let handle = GetStdHandle(STD_OUTPUT_HANDLE);
            let mut info: CONSOLE_SCREEN_BUFFER_INFO = std::mem::zeroed();
            if GetConsoleScreenBufferInfo(handle, &mut info) != 0 {
                let rows = (info.srWindow.Bottom - info.srWindow.Top + 1) as u16;
                let cols = (info.srWindow.Right - info.srWindow.Left + 1) as u16;
                return (rows, cols);
            }
        }
    }
    (24, 80)
}

fn write_status_bar(
    w: &mut impl std::io::Write,
    is_public: bool,
    num_browsers: u64,
    open_url: &str,
) {
    let (rows, cols) = get_terminal_size();
    let mode = if is_public { "public" } else { "private" };
    let enc = if is_public {
        "unencrypted"
    } else {
        "encrypted"
    };
    let status = format!(
        " {} | {} | viewers: {} | {} ",
        mode, enc, num_browsers, open_url
    );
    let display: String = status.chars().take(cols as usize).collect();
    let _ = write!(
        w,
        "\x1b7\x1b[{};1H\x1b[33;100m\x1b[2K{}\x1b[m\x1b8",
        rows, display
    );
}

pub struct ShareOptions {
    pub cmd: Vec<String>,
    pub url: String,
    pub allow_browser_control: bool,
    pub open_browser: bool,
    pub is_public: bool,
    pub yes: bool,
}

pub async fn broadcast_terminal(opts: ShareOptions) -> Result<(), String> {
    let ShareOptions {
        cmd,
        url,
        allow_browser_control,
        open_browser,
        is_public,
        yes,
    } = opts;
    let (rows, cols) = get_terminal_size();

    let pty_rows = rows.saturating_sub(1).max(1);
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: pty_rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("failed to open pty: {}", e))?;

    let mut cmd_builder = CommandBuilder::new(&cmd[0]);
    for arg in &cmd[1..] {
        cmd_builder.arg(arg);
    }
    cmd_builder.env("TERMPAIR_BROADCASTING", "1");
    cmd_builder.env(
        "TERMPAIR_BROWSERS_CAN_CONTROL",
        if allow_browser_control { "1" } else { "0" },
    );
    for var in SENSITIVE_ENV_VARS {
        cmd_builder.env(var, "");
    }

    let mut child = pair
        .slave
        .spawn_command(cmd_builder)
        .map_err(|e| format!("failed to spawn command: {}", e))?;
    drop(pair.slave);

    let master = Arc::new(Mutex::new(pair.master));
    let reader = {
        let m = master
            .lock()
            .map_err(|_| "master pty lock poisoned".to_string())?;
        m.try_clone_reader()
            .map_err(|e| format!("failed to clone reader: {}", e))?
    };
    let writer = {
        let m = master
            .lock()
            .map_err(|_| "master pty lock poisoned".to_string())?;
        m.take_writer()
            .map_err(|e| format!("failed to take writer: {}", e))?
    };

    let opts = ShareOptions {
        cmd,
        url,
        allow_browser_control,
        open_browser,
        is_public,
        yes,
    };
    run_parent(master, reader, writer, opts).await?;

    let _ = child.kill();
    let _ = child.wait();
    Ok(())
}

async fn run_parent(
    master: Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
    reader: Box<dyn Read + Send>,
    writer: Box<dyn Write + Send>,
    opts: ShareOptions,
) -> Result<(), String> {
    let ShareOptions {
        cmd,
        url,
        allow_browser_control,
        open_browser,
        is_public,
        yes,
    } = opts;
    let (rows, cols) = get_terminal_size();

    let ws_url = if url.starts_with("https://") {
        url.replacen("https://", "wss://", 1)
    } else if url.starts_with("http://") {
        url.replacen("http://", "ws://", 1)
    } else {
        return Err("url must start with http:// or https://".into());
    };
    let ws_endpoint = format!("{}connect_to_terminal", ws_url);

    let (ws_stream, _) = tokio_tungstenite::connect_async(&ws_endpoint)
        .await
        .map_err(|e| format!("connection refused. is the termpair server running? {}", e))?;

    let (mut ws_tx, mut ws_rx) = ws_stream.split();

    let mut aes_keys = AesKeys::new();
    let num_browsers = Arc::new(AtomicU64::new(0));
    let pty_rows = rows.saturating_sub(1).max(1);

    let now = chrono::Utc::now().to_rfc3339();
    let init_msg = json!({
        "rows": pty_rows,
        "cols": cols,
        "allow_browser_control": allow_browser_control,
        "command": cmd.join(" "),
        "broadcast_start_time_iso": now,
        "subprotocol_version": SUBPROTOCOL_VERSION,
        "is_public": is_public,
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

    let d = "\x1b[90m";
    let r = "\x1b[0m";
    let bar: String = "\u{2501}".repeat(cols as usize);
    eprintln!("{d}{bar}{r}");

    let open_url = if is_public {
        let public_url = format!("{}s/{}", url, terminal_id);
        eprintln!("\x1b[1;31m\u{25cf} Public session{r}");
        eprintln!();
        eprintln!("  {d}Link:{r}       \x1b[4m{}{r}", public_url);
        eprintln!("  {d}Encryption:{r} none");
        eprintln!("  {d}Viewers:{r}    read-only {d}(anyone can find this session){r}");
        public_url
    } else {
        let secret_key_b64url = BASE64URL.encode(&aes_keys.bootstrap_key);
        let share_url = format!("{}s/{}#{}", url, terminal_id, secret_key_b64url);
        eprintln!("\x1b[1;33m\u{25cf} Private session{r}");
        eprintln!();
        eprintln!("  {d}Link:{r}       \x1b[4m{}{r}", share_url);
        eprintln!("  {d}Encryption:{r} AES-128-GCM {d}(key is in the URL fragment){r}");
        if allow_browser_control {
            eprintln!("  {d}Viewers:{r}    read + write {d}(only people with the link){r}");
        } else {
            eprintln!("  {d}Viewers:{r}    read-only {d}(only people with the link){r}");
        }
        share_url
    };
    eprintln!();
    eprintln!("  {d}To stop: type 'exit', press Ctrl+C, or close the terminal{r}");
    eprintln!("{d}{bar}{r}");

    if open_browser {
        let _ = open::that(&open_url);
    }

    if !yes {
        eprint!("\x1b[1mPress Enter to start...\x1b[0m");
        let _ = std::io::stderr().flush();
        let mut buf = String::new();
        let _ = std::io::stdin().read_line(&mut buf);
    }

    let _raw_guard =
        raw_mode::RawModeGuard::enter().map_err(|e| format!("failed to set raw mode: {}", e))?;

    {
        let mut stdout = std::io::stdout().lock();
        let _ = write!(stdout, "\x1b[2J\x1b[H\x1b[1;{}r", pty_rows);
        write_status_bar(&mut stdout, is_public, 0, &open_url);
        let _ = stdout.flush();
    }

    let last_output = Arc::new(AtomicU64::new(0));

    let (outgoing_tx, mut outgoing_rx) = mpsc::channel::<String>(256);

    let outgoing_tx_pty = outgoing_tx.clone();
    let reader = Arc::new(Mutex::new(reader));
    let pty_read_task = {
        let reader = reader.clone();
        let last_output = last_output.clone();
        tokio::task::spawn_blocking(move || {
            let mut buf = vec![0u8; MAX_READ_BYTES];
            let mut reader = match reader.lock() {
                Ok(r) => r,
                Err(_) => return,
            };
            let start = std::time::Instant::now();
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let output = buf[..n].to_vec();
                        last_output.store(start.elapsed().as_millis() as u64, Ordering::Relaxed);

                        {
                            let mut stdout = std::io::stdout().lock();
                            let _ = stdout.write_all(&output);
                            let _ = stdout.flush();
                        }

                        let plaintext = json!({
                            "pty_output": BASE64.encode(&output),
                        });
                        let plaintext_bytes = plaintext.to_string().into_bytes();

                        let _ = outgoing_tx_pty.blocking_send(format!(
                            "__pty_raw:{}",
                            BASE64.encode(&plaintext_bytes)
                        ));
                    }
                    Err(_) => break,
                }
            }
        })
    };

    let (redraw_tx, mut redraw_rx) = mpsc::channel::<()>(4);
    let status_bar_task = {
        let num_browsers = num_browsers.clone();
        let open_url = open_url.clone();
        let last_output = last_output.clone();
        tokio::spawn(async move {
            let start = std::time::Instant::now();
            loop {
                tokio::select! {
                    _ = redraw_rx.recv() => {}
                    _ = tokio::time::sleep(std::time::Duration::from_secs(30)) => {}
                }
                tokio::time::sleep(std::time::Duration::from_millis(150)).await;
                let now_ms = start.elapsed().as_millis() as u64;
                let last_ms = last_output.load(Ordering::Relaxed);
                if now_ms.saturating_sub(last_ms) > 100 {
                    let mut stdout = std::io::stdout().lock();
                    write_status_bar(
                        &mut stdout,
                        is_public,
                        num_browsers.load(Ordering::Relaxed),
                        &open_url,
                    );
                    let _ = stdout.flush();
                }
            }
        })
    };

    let writer = Arc::new(Mutex::new(writer));
    let writer_for_stdin = writer.clone();
    let stdin_task = tokio::task::spawn_blocking(move || {
        let mut buf = vec![0u8; MAX_READ_BYTES];
        let stdin = std::io::stdin();
        let mut stdin_lock = stdin.lock();
        loop {
            match stdin_lock.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if let Ok(mut w) = writer_for_stdin.lock() {
                        let _ = w.write_all(&buf[..n]);
                        let _ = w.flush();
                    }
                }
                Err(_) => break,
            }
        }
    });

    #[cfg(unix)]
    let resize_task = {
        let outgoing_tx_resize = outgoing_tx.clone();
        let master_resize = master.clone();
        let redraw_tx = redraw_tx.clone();
        let mut sigwinch =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::window_change())
                .map_err(|e| format!("signal handler failed: {}", e))?;
        tokio::spawn(async move {
            while sigwinch.recv().await.is_some() {
                let (rows, cols) = get_terminal_size();
                let pty_rows = rows.saturating_sub(1).max(1);
                if let Ok(m) = master_resize.lock() {
                    let _ = m.resize(PtySize {
                        rows: pty_rows,
                        cols,
                        pixel_width: 0,
                        pixel_height: 0,
                    });
                }
                {
                    let mut stdout = std::io::stdout().lock();
                    let _ = write!(stdout, "\x1b[1;{}r", pty_rows);
                    let _ = stdout.flush();
                }
                let _ = redraw_tx.send(()).await;
                let msg = json!({"event": "resize", "payload": {"rows": pty_rows, "cols": cols}});
                let _ = outgoing_tx_resize.send(msg.to_string()).await;
            }
        })
    };

    #[cfg(windows)]
    let resize_task = {
        let outgoing_tx_resize = outgoing_tx.clone();
        let master_resize = master.clone();
        let redraw_tx = redraw_tx.clone();
        tokio::spawn(async move {
            let mut last_size = get_terminal_size();
            loop {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                let current = get_terminal_size();
                if current != last_size {
                    last_size = current;
                    let (rows, cols) = current;
                    let pty_rows = rows.saturating_sub(1).max(1);
                    if let Ok(m) = master_resize.lock() {
                        let _ = m.resize(PtySize {
                            rows: pty_rows,
                            cols,
                            pixel_width: 0,
                            pixel_height: 0,
                        });
                    }
                    {
                        let mut stdout = std::io::stdout().lock();
                        let _ = write!(stdout, "\x1b[1;{}r", pty_rows);
                        let _ = stdout.flush();
                    }
                    let _ = redraw_tx.send(()).await;
                    let msg =
                        json!({"event": "resize", "payload": {"rows": pty_rows, "cols": cols}});
                    let _ = outgoing_tx_resize.send(msg.to_string()).await;
                }
            }
        })
    };

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

    let writer_for_browser = writer.clone();
    let master_for_resize = master.clone();
    let main_loop_task = tokio::spawn(async move {
        while let Some(msg) = outgoing_rx.recv().await {
            if let Some(raw_b64) = msg.strip_prefix("__pty_raw:") {
                if let Ok(plaintext_bytes) = BASE64.decode(raw_b64) {
                    if is_public {
                        let ws_msg = json!({
                            "event": "new_output",
                            "payload": BASE64.encode(&plaintext_bytes),
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
                    } else {
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
                }
            } else if let Some(browser_msg) = msg.strip_prefix("__from_browser:") {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(browser_msg) {
                    let event = parsed["event"].as_str().unwrap_or("");
                    match event {
                        "command" => {
                            if allow_browser_control && !is_public {
                                if let Some(payload) = parsed["payload"].as_str() {
                                    if let Ok(encrypted_bytes) = BASE64.decode(payload) {
                                        if let Ok(decrypted) = aes_keys.decrypt(&encrypted_bytes) {
                                            if let Ok(data) =
                                                serde_json::from_slice::<serde_json::Value>(
                                                    &decrypted,
                                                )
                                            {
                                                if let Some(input) = data["data"].as_str() {
                                                    if input.len() <= MAX_COMMAND_INPUT_BYTES {
                                                        if let Ok(mut w) = writer_for_browser.lock()
                                                        {
                                                            let _ = w.write_all(input.as_bytes());
                                                            let _ = w.flush();
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        "request_terminal_dimensions" => {
                            let (rows, cols) = get_terminal_size();
                            let pty_rows = rows.saturating_sub(1).max(1);
                            if let Ok(m) = master_for_resize.lock() {
                                let _ = m.resize(PtySize {
                                    rows: pty_rows,
                                    cols,
                                    pixel_width: 0,
                                    pixel_height: 0,
                                });
                            }
                            let resize_msg = json!({"event": "resize", "payload": {"rows": pty_rows, "cols": cols}});
                            let _ = ws_tx
                                .send(tokio_tungstenite::tungstenite::Message::Text(
                                    resize_msg.to_string().into(),
                                ))
                                .await;
                        }
                        "request_key_rotation" => {
                            if !is_public {
                                if let Ok(rotation_msg) = aes_keys.rotate_keys() {
                                    let _ = ws_tx
                                        .send(tokio_tungstenite::tungstenite::Message::Text(
                                            rotation_msg.into(),
                                        ))
                                        .await;
                                }
                            }
                        }
                        "new_browser_connected" => {
                            if !is_public {
                                let count = num_browsers.load(Ordering::Relaxed).max(1);
                                if let Ok(keys_msg) = aes_keys.build_aes_keys_message(count) {
                                    let _ = ws_tx
                                        .send(tokio_tungstenite::tungstenite::Message::Text(
                                            keys_msg.into(),
                                        ))
                                        .await;
                                }
                            }
                        }
                        "num_clients" => {
                            if let Some(n) = parsed["payload"].as_u64() {
                                num_browsers.store(n, Ordering::Relaxed);
                                let _ = redraw_tx.send(()).await;
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
    resize_task.abort();
    status_bar_task.abort();

    {
        let (rows, _) = get_terminal_size();
        let mut stdout = std::io::stdout();
        let _ = write!(stdout, "\x1b[r\x1b[{};1H\x1b[2K", rows);
        let _ = stdout.flush();
    }
    let _ = std::io::stderr().flush();

    drop(_raw_guard);

    let (_, cols) = get_terminal_size();
    let d = "\x1b[90m";
    let r = "\x1b[0m";
    let bar: String = "\u{2501}".repeat(cols as usize);
    eprintln!();
    eprintln!("{d}{bar}{r}");
    eprintln!("Session ended.");
    eprintln!("{d}{bar}{r}");

    std::process::exit(0);
}
