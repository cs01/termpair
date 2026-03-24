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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn connection_tracker_allows_within_limit() {
        let tracker = ConnectionTracker::new(3);
        let ip: IpAddr = "1.2.3.4".parse().unwrap();
        assert!(tracker.try_add(ip).await);
        assert!(tracker.try_add(ip).await);
        assert!(tracker.try_add(ip).await);
    }

    #[tokio::test]
    async fn connection_tracker_rejects_over_limit() {
        let tracker = ConnectionTracker::new(2);
        let ip: IpAddr = "1.2.3.4".parse().unwrap();
        assert!(tracker.try_add(ip).await);
        assert!(tracker.try_add(ip).await);
        assert!(!tracker.try_add(ip).await);
    }

    #[tokio::test]
    async fn connection_tracker_separate_ips() {
        let tracker = ConnectionTracker::new(1);
        let ip1: IpAddr = "1.2.3.4".parse().unwrap();
        let ip2: IpAddr = "5.6.7.8".parse().unwrap();
        assert!(tracker.try_add(ip1).await);
        assert!(!tracker.try_add(ip1).await);
        assert!(tracker.try_add(ip2).await);
    }

    #[tokio::test]
    async fn connection_tracker_remove_allows_new() {
        let tracker = ConnectionTracker::new(1);
        let ip: IpAddr = "1.2.3.4".parse().unwrap();
        assert!(tracker.try_add(ip).await);
        assert!(!tracker.try_add(ip).await);
        tracker.remove(ip).await;
        assert!(tracker.try_add(ip).await);
    }

    #[tokio::test]
    async fn connection_tracker_remove_nonexistent() {
        let tracker = ConnectionTracker::new(5);
        let ip: IpAddr = "1.2.3.4".parse().unwrap();
        tracker.remove(ip).await;
    }

    #[tokio::test]
    async fn connection_tracker_remove_cleans_up_map() {
        let tracker = ConnectionTracker::new(5);
        let ip: IpAddr = "1.2.3.4".parse().unwrap();
        tracker.try_add(ip).await;
        tracker.remove(ip).await;
        let map = tracker.connections.lock().await;
        assert!(!map.contains_key(&ip));
    }

    #[tokio::test]
    async fn connection_tracker_partial_remove() {
        let tracker = ConnectionTracker::new(3);
        let ip: IpAddr = "1.2.3.4".parse().unwrap();
        tracker.try_add(ip).await;
        tracker.try_add(ip).await;
        tracker.remove(ip).await;
        let map = tracker.connections.lock().await;
        assert_eq!(*map.get(&ip).unwrap(), 1);
    }

    #[tokio::test]
    async fn connection_tracker_zero_limit() {
        let tracker = ConnectionTracker::new(0);
        let ip: IpAddr = "1.2.3.4".parse().unwrap();
        assert!(!tracker.try_add(ip).await);
    }

    #[tokio::test]
    async fn connection_tracker_ipv6() {
        let tracker = ConnectionTracker::new(2);
        let ip: IpAddr = "::1".parse().unwrap();
        assert!(tracker.try_add(ip).await);
        assert!(tracker.try_add(ip).await);
        assert!(!tracker.try_add(ip).await);
    }

    #[tokio::test]
    async fn new_terminals_is_empty() {
        let terminals = new_terminals();
        let map = terminals.read().await;
        assert!(map.is_empty());
    }
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
