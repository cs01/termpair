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
    #[serde(default)]
    pub is_public: bool,
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
    #[serde(default)]
    pub is_public: bool,
    #[serde(default)]
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicSession {
    pub terminal_id: String,
    pub display_name: String,
    pub command: String,
    pub cols: u16,
    pub rows: u16,
    pub allow_browser_control: bool,
    pub broadcast_start_time_iso: String,
    pub viewer_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResizePayload {
    pub rows: u16,
    pub cols: u16,
}
