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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ws_message_round_trip() {
        let msg = WsMessage {
            event: "new_output".into(),
            payload: serde_json::json!({"data": "hello"}),
        };
        let json = serde_json::to_string(&msg).unwrap();
        let parsed: WsMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.event, "new_output");
        assert_eq!(parsed.payload["data"], "hello");
    }

    #[test]
    fn ws_message_empty_payload_default() {
        let json = r#"{"event": "ping"}"#;
        let parsed: WsMessage = serde_json::from_str(json).unwrap();
        assert_eq!(parsed.event, "ping");
        assert!(parsed.payload.is_null());
    }

    #[test]
    fn terminal_init_data_round_trip() {
        let data = TerminalInitData {
            rows: 24,
            cols: 80,
            allow_browser_control: true,
            command: "bash".into(),
            broadcast_start_time_iso: "2024-01-01T00:00:00Z".into(),
            subprotocol_version: "4".into(),
            is_public: false,
        };
        let json = serde_json::to_string(&data).unwrap();
        let parsed: TerminalInitData = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.rows, 24);
        assert_eq!(parsed.cols, 80);
        assert!(parsed.allow_browser_control);
        assert_eq!(parsed.command, "bash");
        assert!(!parsed.is_public);
    }

    #[test]
    fn terminal_init_data_is_public_defaults_false() {
        let json = r#"{"rows":24,"cols":80,"allow_browser_control":false,"command":"bash","broadcast_start_time_iso":"","subprotocol_version":"4"}"#;
        let parsed: TerminalInitData = serde_json::from_str(json).unwrap();
        assert!(!parsed.is_public);
    }

    #[test]
    fn terminal_info_round_trip() {
        let info = TerminalInfo {
            terminal_id: "abc123".into(),
            cols: 80,
            rows: 24,
            allow_browser_control: true,
            command: "bash".into(),
            broadcast_start_time_iso: "2024-01-01T00:00:00Z".into(),
            termpair_version: "1.1.0".into(),
            is_public: false,
            display_name: "".into(),
        };
        let json = serde_json::to_string(&info).unwrap();
        let parsed: TerminalInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.terminal_id, "abc123");
        assert_eq!(parsed.termpair_version, "1.1.0");
    }

    #[test]
    fn public_session_round_trip() {
        let session = PublicSession {
            terminal_id: "xyz".into(),
            display_name: "brave-falcon".into(),
            command: "bash".into(),
            cols: 120,
            rows: 40,
            allow_browser_control: false,
            broadcast_start_time_iso: "2024-01-01T00:00:00Z".into(),
            viewer_count: 5,
        };
        let json = serde_json::to_string(&session).unwrap();
        let parsed: PublicSession = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.display_name, "brave-falcon");
        assert_eq!(parsed.viewer_count, 5);
    }

    #[test]
    fn resize_payload_round_trip() {
        let resize = ResizePayload {
            rows: 50,
            cols: 200,
        };
        let json = serde_json::to_string(&resize).unwrap();
        let parsed: ResizePayload = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.rows, 50);
        assert_eq!(parsed.cols, 200);
    }

    #[test]
    fn ws_message_with_resize_payload() {
        let msg = WsMessage {
            event: "resize".into(),
            payload: serde_json::json!({"rows": 30, "cols": 100}),
        };
        let json = serde_json::to_string(&msg).unwrap();
        let parsed: WsMessage = serde_json::from_str(&json).unwrap();
        let resize: ResizePayload = serde_json::from_value(parsed.payload).unwrap();
        assert_eq!(resize.rows, 30);
        assert_eq!(resize.cols, 100);
    }
}
