use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsMessage {
    pub event: String,
    #[serde(default)]
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalInitData {
    pub rows: u16,
    pub cols: u16,
    pub allow_browser_control: bool,
    pub command: String,
    pub broadcast_start_time_iso: String,
    pub subprotocol_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalInfo {
    pub terminal_id: String,
    pub cols: u16,
    pub rows: u16,
    pub allow_browser_control: bool,
    pub command: String,
    pub broadcast_start_time_iso: String,
    pub termpair_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResizePayload {
    pub rows: u16,
    pub cols: u16,
}

