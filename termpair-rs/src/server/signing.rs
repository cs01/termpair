use hmac::{Hmac, Mac};
use rand::rngs::OsRng;
use rand::RngCore;
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

pub fn load_signing_key() -> [u8; 32] {
    if let Ok(hex_key) = std::env::var("TERMPAIR_SIGNING_KEY") {
        if let Ok(bytes) = hex::decode(hex_key.trim()) {
            if bytes.len() == 32 {
                let mut key = [0u8; 32];
                key.copy_from_slice(&bytes);
                return key;
            }
            tracing::warn!("TERMPAIR_SIGNING_KEY must be 64 hex chars (32 bytes), ignoring");
        } else {
            tracing::warn!("TERMPAIR_SIGNING_KEY is not valid hex, ignoring");
        }
    }

    let key_dir = dirs::home_dir()
        .map(|h| h.join(".termpair"))
        .unwrap_or_else(|| std::path::PathBuf::from(".termpair"));
    let key_path = key_dir.join("signing.key");

    if let Ok(contents) = std::fs::read_to_string(&key_path) {
        if let Ok(bytes) = hex::decode(contents.trim()) {
            if bytes.len() == 32 {
                let mut key = [0u8; 32];
                key.copy_from_slice(&bytes);
                tracing::info!("loaded signing key from {}", key_path.display());
                return key;
            }
        }
        tracing::warn!(
            "invalid signing key file at {}, regenerating",
            key_path.display()
        );
    }

    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);
    let _ = std::fs::create_dir_all(&key_dir);
    if std::fs::write(&key_path, hex::encode(key)).is_ok() {
        tracing::info!("generated signing key at {}", key_path.display());
    } else {
        tracing::warn!(
            "could not write signing key to {}, using ephemeral key",
            key_path.display()
        );
    }
    key
}

pub fn create_reconnect_token(signing_key: &[u8; 32], terminal_id: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(signing_key).expect("HMAC key length is valid");
    mac.update(terminal_id.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

pub fn verify_reconnect_token(signing_key: &[u8; 32], terminal_id: &str, token: &str) -> bool {
    let expected = create_reconnect_token(signing_key, terminal_id);
    constant_time_eq(expected.as_bytes(), token.as_bytes())
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter()
        .zip(b.iter())
        .fold(0u8, |acc, (x, y)| acc | (x ^ y))
        == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_roundtrip() {
        let key = [42u8; 32];
        let token = create_reconnect_token(&key, "test123");
        assert!(verify_reconnect_token(&key, "test123", &token));
        assert!(!verify_reconnect_token(&key, "test456", &token));
    }

    #[test]
    fn test_wrong_key_fails() {
        let key1 = [1u8; 32];
        let key2 = [2u8; 32];
        let token = create_reconnect_token(&key1, "test");
        assert!(!verify_reconnect_token(&key2, "test", &token));
    }
}
