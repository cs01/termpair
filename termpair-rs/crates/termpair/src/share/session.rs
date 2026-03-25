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

use crate::share::aes_keys::AesKeys;
use termpair_common::constants::{MAX_COMMAND_INPUT_BYTES, MAX_READ_BYTES, SUBPROTOCOL_VERSION};

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

pub struct ShareOptions {
    pub cmd: Vec<String>,
    pub url: String,
    pub allow_browser_control: bool,
    pub open_browser: bool,
    pub is_public: bool,
    pub yes: bool,
    pub reconnect_timeout: u64,
    pub brand: String,
}

pub async fn broadcast_terminal(opts: ShareOptions) -> Result<(), String> {
    let ShareOptions {
        cmd,
        url,
        allow_browser_control,
        open_browser,
        is_public,
        yes,
        reconnect_timeout,
        brand,
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

    run_parent(
        master,
        reader,
        writer,
        ShareOptions {
            cmd,
            url,
            allow_browser_control,
            open_browser,
            is_public,
            yes,
            reconnect_timeout,
            brand,
        },
    )
    .await?;

    let _ = child.kill();
    let _ = child.wait();
    Ok(())
}

use std::collections::VecDeque;
use std::sync::atomic::AtomicBool;
use tokio_tungstenite::tungstenite;

struct WsConnection {
    ws_tx: futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        tungstenite::Message,
    >,
    ws_rx: futures_util::stream::SplitStream<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
    >,
    terminal_id: String,
    reconnect_token: String,
}

async fn ws_connect(
    ws_endpoint: &str,
    init_msg: &serde_json::Value,
    terminal_id: Option<&str>,
    reconnect_token: Option<&str>,
) -> Result<WsConnection, String> {
    let url = if let (Some(tid), Some(token)) = (terminal_id, reconnect_token) {
        format!(
            "{}?terminal_id={}&reconnect_token={}",
            ws_endpoint,
            urlencoding::encode(tid),
            urlencoding::encode(token)
        )
    } else {
        ws_endpoint.to_string()
    };

    let (ws_stream, _) = tokio_tungstenite::connect_async(&url)
        .await
        .map_err(|e| format!("connection failed: {}", e))?;

    let (mut ws_tx, mut ws_rx) = ws_stream.split();

    ws_tx
        .send(tungstenite::Message::Text(init_msg.to_string().into()))
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

    let tid = resp_json["payload"]["terminal_id"]
        .as_str()
        .ok_or("missing terminal_id")?
        .to_string();
    let token = resp_json["payload"]["reconnect_token"]
        .as_str()
        .ok_or("missing reconnect_token")?
        .to_string();

    Ok(WsConnection {
        ws_tx,
        ws_rx,
        terminal_id: tid,
        reconnect_token: token,
    })
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
        reconnect_timeout,
        brand,
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

    let mut aes_keys = AesKeys::new();
    let num_browsers = Arc::new(AtomicU64::new(0));
    let pty_rows = rows.saturating_sub(1).max(1);

    let broadcast_start_time = chrono::Utc::now().to_rfc3339();
    let init_msg = json!({
        "rows": pty_rows,
        "cols": cols,
        "allow_browser_control": allow_browser_control,
        "command": cmd.join(" "),
        "broadcast_start_time_iso": broadcast_start_time,
        "subprotocol_version": SUBPROTOCOL_VERSION,
        "is_public": is_public,
    });

    let conn = ws_connect(&ws_endpoint, &init_msg, None, None)
        .await
        .map_err(|e| format!("connection refused. is the termpair server running? {}", e))?;

    let terminal_id = conn.terminal_id;
    let reconnect_token_value = conn.reconnect_token;

    let d = "\x1b[90m";
    let r = "\x1b[0m";
    let bar: String = "\u{2501}".repeat(cols as usize);
    eprintln!("{d}{bar}{r}");

    let open_url = if is_public {
        let public_url = format!("{}s/{}", url, terminal_id);
        eprintln!("\x1b[1;31m\u{25cf} Public {brand} session{r}");
        eprintln!();
        eprintln!("  {d}Link:{r}       \x1b[4m{}{r}", public_url);
        eprintln!("  {d}Encryption:{r} none");
        eprintln!("  {d}Viewers:{r}    read-only {d}(anyone can find this session){r}");
        public_url
    } else {
        let secret_key_b64url = BASE64URL.encode(&aes_keys.bootstrap_key);
        let share_url = format!("{}s/{}#{}", url, terminal_id, secret_key_b64url);
        eprintln!("\x1b[1;33m\u{25cf} Private {brand} session{r}");
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
        let _ = write!(stdout, "\x1b[2J\x1b[H");
        let _ = stdout.flush();
    }

    let start_time = std::time::Instant::now();

    let (outgoing_tx, mut outgoing_rx) = mpsc::channel::<String>(256);

    let pty_alive = Arc::new(AtomicBool::new(true));

    let outgoing_tx_pty = outgoing_tx.clone();
    let reader = Arc::new(Mutex::new(reader));
    let pty_alive_clone = pty_alive.clone();
    let mut pty_read_task = {
        let reader = reader.clone();
        tokio::task::spawn_blocking(move || {
            let mut buf = vec![0u8; MAX_READ_BYTES];
            let mut reader = match reader.lock() {
                Ok(r) => r,
                Err(_) => return,
            };
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let output = buf[..n].to_vec();

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
            pty_alive_clone.store(false, Ordering::Relaxed);
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
                let msg = json!({"event": "resize", "payload": {"rows": pty_rows, "cols": cols}});
                let _ = outgoing_tx_resize.send(msg.to_string()).await;
            }
        })
    };

    #[cfg(windows)]
    let resize_task = {
        let outgoing_tx_resize = outgoing_tx.clone();
        let master_resize = master.clone();
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
                    let msg =
                        json!({"event": "resize", "payload": {"rows": pty_rows, "cols": cols}});
                    let _ = outgoing_tx_resize.send(msg.to_string()).await;
                }
            }
        })
    };

    let mut ws_tx = conn.ws_tx;
    let ws_rx = conn.ws_rx;

    let (ws_msg_tx, mut ws_msg_rx) = mpsc::channel::<String>(256);

    let outgoing_tx_ws_recv = ws_msg_tx.clone();
    let mut ws_recv_handle = tokio::spawn(async move {
        let mut ws_rx = ws_rx;
        while let Some(Ok(msg)) = ws_rx.next().await {
            if let Ok(text) = msg.into_text() {
                if outgoing_tx_ws_recv.send(text.to_string()).await.is_err() {
                    break;
                }
            }
        }
    });

    let writer_for_browser = writer.clone();
    let master_for_resize = master.clone();

    const MAX_BUFFER_BYTES: usize = 65536;

    loop {
        let mut buffer: VecDeque<String> = VecDeque::new();
        let mut buffer_bytes: usize = 0;
        let mut ws_disconnected = false;

        loop {
            tokio::select! {
                biased;
                result = &mut pty_read_task, if !pty_read_task.is_finished() => {
                    let _ = result;
                    break;
                }
                msg = outgoing_rx.recv() => {
                    let Some(msg) = msg else { break; };
                    if let Some(raw_b64) = msg.strip_prefix("__pty_raw:") {
                        if ws_disconnected {
                            let msg_len = raw_b64.len();
                            while buffer_bytes + msg_len > MAX_BUFFER_BYTES && !buffer.is_empty() {
                                if let Some(old) = buffer.pop_front() {
                                    buffer_bytes = buffer_bytes.saturating_sub(old.len());
                                }
                            }
                            buffer.push_back(raw_b64.to_string());
                            buffer_bytes += msg_len;
                            continue;
                        }
                        if let Ok(plaintext_bytes) = BASE64.decode(raw_b64) {
                            if is_public {
                                let ws_msg = json!({
                                    "event": "new_output",
                                    "payload": BASE64.encode(&plaintext_bytes),
                                });
                                if ws_tx
                                    .send(tungstenite::Message::Text(ws_msg.to_string().into()))
                                    .await
                                    .is_err()
                                {
                                    ws_disconnected = true;
                                    continue;
                                }
                            } else {
                                match aes_keys.encrypt(&plaintext_bytes) {
                                    Ok(encrypted) => {
                                        let ws_msg = json!({
                                            "event": "new_output",
                                            "payload": BASE64.encode(&encrypted),
                                        });
                                        if ws_tx
                                            .send(tungstenite::Message::Text(ws_msg.to_string().into()))
                                            .await
                                            .is_err()
                                        {
                                            ws_disconnected = true;
                                            continue;
                                        }
                                        if aes_keys.need_rotation() {
                                            if let Ok(rotation_msg) = aes_keys.rotate_keys() {
                                                let _ = ws_tx
                                                    .send(tungstenite::Message::Text(rotation_msg.into()))
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
                    } else {
                        if ws_disconnected {
                            continue;
                        }
                        if ws_tx
                            .send(tungstenite::Message::Text(msg.into()))
                            .await
                            .is_err()
                        {
                            ws_disconnected = true;
                        }
                    }
                }
                msg = ws_msg_rx.recv() => {
                    let Some(text) = msg else {
                        ws_disconnected = true;
                        continue;
                    };
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                        let event = parsed["event"].as_str().unwrap_or("");
                        match event {
                            "command" => {
                                if allow_browser_control && !is_public {
                                    if let Some(payload) = parsed["payload"].as_str() {
                                        if let Ok(encrypted_bytes) = BASE64.decode(payload) {
                                            if let Ok(decrypted) = aes_keys.decrypt(&encrypted_bytes) {
                                                if let Ok(data) =
                                                    serde_json::from_slice::<serde_json::Value>(&decrypted)
                                                {
                                                    if let Some(input) = data["data"].as_str() {
                                                        if input.len() <= MAX_COMMAND_INPUT_BYTES {
                                                            if let Ok(mut w) = writer_for_browser.lock() {
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
                                    .send(tungstenite::Message::Text(resize_msg.to_string().into()))
                                    .await;
                            }
                            "request_key_rotation" => {
                                if !is_public {
                                    if let Ok(rotation_msg) = aes_keys.rotate_keys() {
                                        let _ = ws_tx
                                            .send(tungstenite::Message::Text(rotation_msg.into()))
                                            .await;
                                    }
                                }
                            }
                            "new_browser_connected" => {
                                if !is_public {
                                    let count = num_browsers.load(Ordering::Relaxed).max(1);
                                    if let Ok(keys_msg) = aes_keys.build_aes_keys_message(count) {
                                        let _ = ws_tx
                                            .send(tungstenite::Message::Text(keys_msg.into()))
                                            .await;
                                    }
                                }
                            }
                            "num_clients" => {
                                if let Some(n) = parsed["payload"].as_u64() {
                                    num_browsers.store(n, Ordering::Relaxed);
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
                }
                _ = &mut ws_recv_handle => {
                    ws_disconnected = true;
                    ws_recv_handle = tokio::spawn(std::future::pending());
                    if !pty_alive.load(Ordering::Relaxed) {
                        break;
                    }
                    continue;
                }
            }
        }

        if !pty_alive.load(Ordering::Relaxed) || reconnect_timeout == 0 {
            break;
        }

        let reconnect_start = std::time::Instant::now();
        let timeout_dur = std::time::Duration::from_secs(reconnect_timeout);
        let mut attempt = 0u32;

        {
            let mut stderr = std::io::stderr();
            let _ = write!(
                stderr,
                "\r\n\x1b[1;33mServer disconnected. Reconnecting...\x1b[0m\r\n"
            );
            let _ = stderr.flush();
        }

        let reconnected = loop {
            if reconnect_start.elapsed() >= timeout_dur {
                break false;
            }
            if !pty_alive.load(Ordering::Relaxed) {
                break false;
            }

            let delay = std::time::Duration::from_secs(1u64 << attempt.min(4))
                .min(std::time::Duration::from_secs(30));
            tokio::time::sleep(delay).await;
            attempt += 1;

            match ws_connect(
                &ws_endpoint,
                &init_msg,
                Some(&terminal_id),
                Some(&reconnect_token_value),
            )
            .await
            {
                Ok(new_conn) => {
                    ws_tx = new_conn.ws_tx;

                    if !is_public {
                        aes_keys.reset_keys();
                    }

                    for raw_b64 in buffer.drain(..) {
                        if let Ok(plaintext_bytes) = BASE64.decode(&raw_b64) {
                            if is_public {
                                let ws_msg = json!({
                                    "event": "new_output",
                                    "payload": BASE64.encode(&plaintext_bytes),
                                });
                                let _ = ws_tx
                                    .send(tungstenite::Message::Text(ws_msg.to_string().into()))
                                    .await;
                            } else {
                                if let Ok(encrypted) = aes_keys.encrypt(&plaintext_bytes) {
                                    let ws_msg = json!({
                                        "event": "new_output",
                                        "payload": BASE64.encode(&encrypted),
                                    });
                                    let _ = ws_tx
                                        .send(tungstenite::Message::Text(ws_msg.to_string().into()))
                                        .await;
                                }
                            }
                        }
                    }
                    let _ = buffer_bytes;

                    let new_ws_msg_tx = ws_msg_tx.clone();
                    ws_recv_handle = tokio::spawn(async move {
                        let mut ws_rx = new_conn.ws_rx;
                        while let Some(Ok(msg)) = ws_rx.next().await {
                            if let Ok(text) = msg.into_text() {
                                if new_ws_msg_tx.send(text.to_string()).await.is_err() {
                                    break;
                                }
                            }
                        }
                    });

                    {
                        let mut stderr = std::io::stderr();
                        let _ = write!(stderr, "\r\n\x1b[1;32mReconnected!\x1b[0m\r\n");
                        let _ = stderr.flush();
                    }

                    break true;
                }
                Err(_) => continue,
            }
        };

        if !reconnected {
            break;
        }
    }

    stdin_task.abort();
    resize_task.abort();

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
    let duration = start_time.elapsed();
    let duration_str = format!(
        "{}h {}m {}s",
        duration.as_secs() / 3600,
        (duration.as_secs() % 3600) / 60,
        duration.as_secs() % 60
    );
    eprintln!();
    eprintln!("{d}{bar}{r}");
    let session_type = if is_public { "Public" } else { "Private" };
    eprintln!("\x1b[1;33m✦ {session_type} {brand} session ended{r}");
    eprintln!("  {d}Session ID:{r}  {}", terminal_id);
    eprintln!("  {d}Duration:{r}    {}", duration_str);
    eprintln!("{d}{bar}{r}");

    std::process::exit(0);
}
