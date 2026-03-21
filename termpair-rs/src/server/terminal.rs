use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc, watch, RwLock};

pub type TerminalId = String;

pub struct Terminal {
    pub terminal_tx: mpsc::Sender<String>,
    pub broadcast_tx: broadcast::Sender<String>,
    pub closed_tx: watch::Sender<bool>,
    pub closed_rx: watch::Receiver<bool>,
    pub rows: RwLock<u16>,
    pub cols: RwLock<u16>,
    pub allow_browser_control: bool,
    pub command: String,
    pub broadcast_start_time_iso: String,
    pub browser_count: RwLock<usize>,
}

pub type Terminals = Arc<RwLock<HashMap<TerminalId, Arc<Terminal>>>>;

pub fn new_terminals() -> Terminals {
    Arc::new(RwLock::new(HashMap::new()))
}
