pub const TERMPAIR_VERSION: &str = "1.0.0";
pub const SUBPROTOCOL_VERSION: &str = "4";
pub const MAX_READ_BYTES: usize = 2048;
pub const IV_LENGTH: usize = 12;
pub const KEY_LENGTH_BYTES: usize = 16;
pub const ROTATION_THRESHOLD: u64 = 1 << 20;
pub const JS_MAX_SAFE_INTEGER: u64 = (1u64 << 53) - 1;

pub const MAX_TERMINALS: usize = 200;
pub const MAX_BROWSERS_PER_TERMINAL: usize = 50;

pub const MAX_WS_FRAME_BYTES: usize = 256 * 1024;
pub const WS_IDLE_TIMEOUT_SECS: u64 = 3600;
pub const MAX_WS_MSGS_PER_SEC: u32 = 500;
pub const MAX_TERMINAL_ROWS: u16 = 500;
pub const MAX_TERMINAL_COLS: u16 = 500;
pub const MAX_MESSAGES_PER_KEY: u64 = ROTATION_THRESHOLD * 2;
pub const MAX_COMMAND_INPUT_BYTES: usize = 4096;
pub const MAX_CONNECTIONS_PER_IP: usize = 20;

pub const SHAREMYCLAUDE_HOST: &str = "https://sharemyclau.de";
pub const SHAREMYCLAUDE_PORT: u16 = 443;
pub const SHAREMYCLAUDE_CMD: &str = "claude";
