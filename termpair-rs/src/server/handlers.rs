use std::net::SocketAddr;
use std::sync::Arc;

use axum::extract::connect_info::ConnectInfo;
use axum::extract::ws::{Message, WebSocket};
use axum::extract::{Query, State, WebSocketUpgrade};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::{broadcast, mpsc, watch, RwLock};

use crate::constants::{
    MAX_BROWSERS_PER_TERMINAL, MAX_TERMINALS, MAX_TERMINAL_COLS, MAX_TERMINAL_ROWS,
    MAX_WS_FRAME_BYTES, MAX_WS_MSGS_PER_SEC, SUBPROTOCOL_VERSION, TERMPAIR_VERSION,
    WS_IDLE_TIMEOUT_SECS,
};
use crate::types::{PublicSession, TerminalInfo, WsMessage};

use super::terminal::{Terminal, TerminalId, Terminals};
use super::AppState;

fn generate_terminal_id() -> TerminalId {
    crate::random_string(24)
}

pub async fn ping() -> &'static str {
    "\"pong\""
}

#[derive(Deserialize)]
pub struct TerminalIdQuery {
    pub terminal_id: String,
}

pub async fn get_terminal(
    State(state): State<AppState>,
    axum::extract::Path(terminal_id): axum::extract::Path<String>,
) -> impl IntoResponse {
    let terminals = state.terminals.read().await;
    match terminals.get(&terminal_id) {
        Some(terminal) => {
            let rows = *terminal.rows.read().await;
            let cols = *terminal.cols.read().await;
            let info = TerminalInfo {
                terminal_id,
                cols,
                rows,
                allow_browser_control: terminal.allow_browser_control,
                command: terminal.command.clone(),
                broadcast_start_time_iso: terminal.broadcast_start_time_iso.clone(),
                termpair_version: TERMPAIR_VERSION.to_string(),
                is_public: terminal.is_public,
                display_name: terminal.display_name.clone(),
            };
            Json(info).into_response()
        }
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

pub async fn ws_connect_terminal(
    ws: WebSocketUpgrade,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let ip = addr.ip();
    let connections = state.connections.clone();
    ws.max_frame_size(MAX_WS_FRAME_BYTES)
        .max_message_size(MAX_WS_FRAME_BYTES)
        .on_upgrade(move |socket| handle_terminal_ws(socket, state.terminals, ip, connections))
}

async fn handle_terminal_ws(
    socket: WebSocket,
    terminals: Terminals,
    ip: std::net::IpAddr,
    connections: Arc<super::terminal::ConnectionTracker>,
) {
    if !connections.try_add(ip).await {
        return;
    }

    let result = handle_terminal_ws_inner(socket, terminals.clone()).await;
    connections.remove(ip).await;
    result
}

async fn handle_terminal_ws_inner(socket: WebSocket, terminals: Terminals) {
    let (mut ws_tx, mut ws_rx) = socket.split();

    let init_msg = match ws_rx.next().await {
        Some(Ok(Message::Text(text))) => text,
        _ => return,
    };

    let init_data: crate::types::TerminalInitData = match serde_json::from_str(&init_msg) {
        Ok(d) => d,
        Err(_) => return,
    };

    if init_data.subprotocol_version != SUBPROTOCOL_VERSION {
        let err = WsMessage {
            event: "fatal_error".into(),
            payload: serde_json::Value::String(
                "Client and server are running incompatible versions. \
                 Ensure you are using a compatible version of the TermPair client."
                    .into(),
            ),
        };
        if let Ok(json) = serde_json::to_string(&err) {
            let _ = ws_tx.send(Message::Text(json.into())).await;
        }
        let _ = ws_tx.close().await;
        return;
    }

    let terminal_id = generate_terminal_id();

    let (terminal_tx, mut terminal_rx) = mpsc::channel::<String>(256);
    let (broadcast_tx, _) = broadcast::channel::<String>(256);
    let (closed_tx, closed_rx) = watch::channel(false);

    let display_name = if init_data.is_public {
        crate::names::generate_name()
    } else {
        String::new()
    };

    let terminal = Arc::new(Terminal {
        terminal_tx,
        broadcast_tx: broadcast_tx.clone(),
        closed_tx,
        closed_rx,
        rows: RwLock::new(init_data.rows),
        cols: RwLock::new(init_data.cols),
        allow_browser_control: init_data.allow_browser_control,
        command: init_data.command,
        broadcast_start_time_iso: init_data.broadcast_start_time_iso,
        browser_count: RwLock::new(0),
        is_public: init_data.is_public,
        display_name,
    });

    {
        let mut terms = terminals.write().await;
        if terms.len() >= MAX_TERMINALS {
            let err = WsMessage {
                event: "fatal_error".into(),
                payload: serde_json::Value::String(
                    "server has reached maximum number of active sessions".into(),
                ),
            };
            if let Ok(json) = serde_json::to_string(&err) {
                let _ = ws_tx.send(Message::Text(json.into())).await;
            }
            let _ = ws_tx.close().await;
            return;
        }
        terms.insert(terminal_id.clone(), terminal.clone());
    }

    let start_msg = WsMessage {
        event: "start_broadcast".into(),
        payload: serde_json::Value::String(terminal_id.clone()),
    };
    let start_json = match serde_json::to_string(&start_msg) {
        Ok(j) => j,
        Err(_) => {
            terminals.write().await.remove(&terminal_id);
            return;
        }
    };
    if ws_tx.send(Message::Text(start_json.into())).await.is_err() {
        terminals.write().await.remove(&terminal_id);
        return;
    }

    let terminal_for_forward = terminal.clone();
    let forward_task = tokio::spawn(async move {
        while let Some(msg) = terminal_rx.recv().await {
            if ws_tx.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
        let _ = ws_tx.close().await;
    });

    let idle_timeout = std::time::Duration::from_secs(WS_IDLE_TIMEOUT_SECS);
    let mut msg_count: u32 = 0;
    let mut window_start = std::time::Instant::now();

    loop {
        let msg = match tokio::time::timeout(idle_timeout, ws_rx.next()).await {
            Ok(Some(Ok(msg))) => msg,
            _ => break,
        };

        let now = std::time::Instant::now();
        if now.duration_since(window_start) >= std::time::Duration::from_secs(1) {
            msg_count = 0;
            window_start = now;
        }
        msg_count += 1;
        if msg_count > MAX_WS_MSGS_PER_SEC {
            continue;
        }

        match msg {
            Message::Text(text) => {
                if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                    match ws_msg.event.as_str() {
                        "resize" => {
                            if let Ok(resize) = serde_json::from_value::<crate::types::ResizePayload>(
                                ws_msg.payload.clone(),
                            ) {
                                if resize.rows > 0
                                    && resize.rows <= MAX_TERMINAL_ROWS
                                    && resize.cols > 0
                                    && resize.cols <= MAX_TERMINAL_COLS
                                {
                                    *terminal_for_forward.rows.write().await = resize.rows;
                                    *terminal_for_forward.cols.write().await = resize.cols;
                                    let _ =
                                        terminal_for_forward.broadcast_tx.send(text.to_string());
                                }
                            }
                        }
                        "new_output" | "aes_keys" | "aes_key_rotation" => {
                            let _ = terminal_for_forward.broadcast_tx.send(text.to_string());
                        }
                        _ => {
                            tracing::trace!("unknown event from terminal");
                        }
                    }
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    let _ = terminal_for_forward.closed_tx.send(true);
    forward_task.abort();
    terminals.write().await.remove(&terminal_id);
}

pub async fn ws_connect_browser(
    ws: WebSocketUpgrade,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Query(params): Query<TerminalIdQuery>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let terminal_id = params.terminal_id;
    let ip = addr.ip();
    let connections = state.connections.clone();
    ws.max_frame_size(MAX_WS_FRAME_BYTES)
        .max_message_size(MAX_WS_FRAME_BYTES)
        .on_upgrade(move |socket| {
            handle_browser_ws(socket, terminal_id, state.terminals, ip, connections)
        })
}

async fn handle_browser_ws(
    socket: WebSocket,
    terminal_id: String,
    terminals: Terminals,
    ip: std::net::IpAddr,
    connections: Arc<super::terminal::ConnectionTracker>,
) {
    if !connections.try_add(ip).await {
        return;
    }

    handle_browser_ws_inner(socket, terminal_id, terminals).await;
    connections.remove(ip).await;
}

async fn handle_browser_ws_inner(socket: WebSocket, terminal_id: String, terminals: Terminals) {
    let terminal = {
        let terms = terminals.read().await;
        match terms.get(&terminal_id) {
            Some(t) => t.clone(),
            None => return,
        }
    };

    let (mut ws_tx, mut ws_rx) = socket.split();

    let mut broadcast_rx = terminal.broadcast_tx.subscribe();
    let mut closed_rx = terminal.closed_rx.clone();

    {
        let mut count = terminal.browser_count.write().await;
        if *count >= MAX_BROWSERS_PER_TERMINAL {
            return;
        }
        *count += 1;
        let num = *count;
        drop(count);
        broadcast_num_clients(&terminal, num).await;
    }

    {
        let rows = *terminal.rows.read().await;
        let cols = *terminal.cols.read().await;
        if rows > 0 && cols > 0 {
            let resize_msg = WsMessage {
                event: "resize".into(),
                payload: serde_json::json!({"rows": rows, "cols": cols}),
            };
            if let Ok(json) = serde_json::to_string(&resize_msg) {
                let _ = ws_tx.send(Message::Text(json.into())).await;
            }
        }
    }

    let send_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                result = broadcast_rx.recv() => {
                    match result {
                        Ok(msg) => {
                            if ws_tx.send(Message::Text(msg.into())).await.is_err() {
                                break;
                            }
                        }
                        Err(_) => break,
                    }
                }
                _ = closed_rx.changed() => {
                    let _ = ws_tx.close().await;
                    break;
                }
            }
        }
    });

    let idle_timeout = std::time::Duration::from_secs(WS_IDLE_TIMEOUT_SECS);
    let mut msg_count: u32 = 0;
    let mut window_start = std::time::Instant::now();

    loop {
        let msg = match tokio::time::timeout(idle_timeout, ws_rx.next()).await {
            Ok(Some(Ok(msg))) => msg,
            _ => break,
        };

        let now = std::time::Instant::now();
        if now.duration_since(window_start) >= std::time::Duration::from_secs(1) {
            msg_count = 0;
            window_start = now;
        }
        msg_count += 1;
        if msg_count > MAX_WS_MSGS_PER_SEC {
            continue;
        }

        match msg {
            Message::Text(text) => {
                if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                    if ws_msg.event == "command" && !terminal.allow_browser_control {
                        continue;
                    }
                    let _ = terminal.terminal_tx.send(text.to_string()).await;
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    send_task.abort();

    {
        let mut count = terminal.browser_count.write().await;
        *count = count.saturating_sub(1);
        let num = *count;
        drop(count);
        broadcast_num_clients(&terminal, num).await;
    }
}

pub async fn get_sessions(State(state): State<AppState>) -> Json<Vec<PublicSession>> {
    let terms = state.terminals.read().await;
    let mut sessions: Vec<PublicSession> = Vec::new();
    for (id, terminal) in terms.iter() {
        if !terminal.is_public {
            continue;
        }
        let rows = *terminal.rows.read().await;
        let cols = *terminal.cols.read().await;
        let viewer_count = *terminal.browser_count.read().await;
        sessions.push(PublicSession {
            terminal_id: id.clone(),
            display_name: terminal.display_name.clone(),
            command: terminal.command.clone(),
            cols,
            rows,
            allow_browser_control: terminal.allow_browser_control,
            broadcast_start_time_iso: terminal.broadcast_start_time_iso.clone(),
            viewer_count,
        });
    }
    Json(sessions)
}

async fn broadcast_num_clients(terminal: &Terminal, num: usize) {
    let msg = WsMessage {
        event: "num_clients".into(),
        payload: serde_json::Value::Number(serde_json::Number::from(num)),
    };
    if let Ok(json) = serde_json::to_string(&msg) {
        let _ = terminal.broadcast_tx.send(json);
    }
}
