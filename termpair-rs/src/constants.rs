pub const TERMPAIR_VERSION: &str = "0.5.0";
pub const SUBPROTOCOL_VERSION: &str = "3";
pub const MAX_READ_BYTES: usize = 2048;
pub const IV_LENGTH: usize = 12;
pub const KEY_LENGTH_BYTES: usize = 16;
pub const ROTATION_THRESHOLD: u64 = 1 << 20;
pub const JS_MAX_SAFE_INTEGER: u64 = (1u64 << 53) - 1;

pub const MAX_TERMINALS: usize = 200;
pub const MAX_BROWSERS_PER_TERMINAL: usize = 50;

pub const SHAREMYCLAUDE_HOST: &str = "https://sharemyclau.de";
pub const SHAREMYCLAUDE_PORT: u16 = 443;
pub const SHAREMYCLAUDE_CMD: &str = "claude";
