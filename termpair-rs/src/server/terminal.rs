use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc, watch, Mutex, RwLock};

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
    pub is_public: bool,
    pub display_name: String,
}

pub type Terminals = Arc<RwLock<HashMap<TerminalId, Arc<Terminal>>>>;

pub fn new_terminals() -> Terminals {
    Arc::new(RwLock::new(HashMap::new()))
}

pub struct ConnectionTracker {
    connections: Mutex<HashMap<IpAddr, usize>>,
    max_per_ip: usize,
}

impl ConnectionTracker {
    pub fn new(max_per_ip: usize) -> Self {
        Self {
            connections: Mutex::new(HashMap::new()),
            max_per_ip,
        }
    }

    pub async fn try_add(&self, ip: IpAddr) -> bool {
        let mut map = self.connections.lock().await;
        let count = map.entry(ip).or_insert(0);
        if *count >= self.max_per_ip {
            return false;
        }
        *count += 1;
        true
    }

    pub async fn remove(&self, ip: IpAddr) {
        let mut map = self.connections.lock().await;
        if let Some(count) = map.get_mut(&ip) {
            *count = count.saturating_sub(1);
            if *count == 0 {
                map.remove(&ip);
            }
        }
    }
}
