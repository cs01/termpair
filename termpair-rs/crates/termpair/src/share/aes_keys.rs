use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde_json::json;
use zeroize::Zeroizing;

use termpair_common::constants::{JS_MAX_SAFE_INTEGER, MAX_MESSAGES_PER_KEY, ROTATION_THRESHOLD};
use termpair_common::encryption;

pub struct AesKeys {
    pub bootstrap_key: Zeroizing<Vec<u8>>,
    pub unix_key: Zeroizing<Vec<u8>>,
    pub browser_key: Zeroizing<Vec<u8>>,
    bootstrap_message_count: u64,
    message_count: u64,
    browser_rotation_buffer: u64,
}

impl AesKeys {
    pub fn new() -> Self {
        Self {
            bootstrap_key: encryption::generate_key(),
            unix_key: encryption::generate_key(),
            browser_key: encryption::generate_key(),
            bootstrap_message_count: 0,
            message_count: 0,
            browser_rotation_buffer: (ROTATION_THRESHOLD as f64 * 0.1) as u64,
        }
    }

    pub fn encrypt_bootstrap(&mut self, plaintext: &[u8]) -> Result<Vec<u8>, String> {
        self.bootstrap_message_count += 1;
        encryption::encrypt(self.bootstrap_message_count, &self.bootstrap_key, plaintext)
    }

    pub fn encrypt(&mut self, plaintext: &[u8]) -> Result<Vec<u8>, String> {
        self.message_count += 1;
        if self.message_count >= MAX_MESSAGES_PER_KEY {
            return Err("nonce limit exceeded: key rotation required".into());
        }
        encryption::encrypt(self.message_count, &self.unix_key, plaintext)
    }

    pub fn decrypt(&self, ciphertext: &[u8]) -> Result<Vec<u8>, String> {
        encryption::decrypt(&self.browser_key, ciphertext)
    }

    pub fn need_rotation(&self) -> bool {
        self.message_count > ROTATION_THRESHOLD
    }

    pub fn get_start_iv_count(&self, browser_number: u64) -> Result<u64, String> {
        let start = (browser_number - 1) * ROTATION_THRESHOLD;
        if start > JS_MAX_SAFE_INTEGER {
            return Err("cannot create safe AES nonce".into());
        }
        Ok(start)
    }

    pub fn get_max_iv_for_browser(&self, start_iv: u64) -> Result<u64, String> {
        let max = start_iv + ROTATION_THRESHOLD - self.browser_rotation_buffer;
        if max > JS_MAX_SAFE_INTEGER || max < start_iv {
            return Err("cannot create safe AES nonce".into());
        }
        Ok(max)
    }

    pub fn reset_keys(&mut self) {
        self.unix_key = encryption::generate_key();
        self.browser_key = encryption::generate_key();
        self.message_count = 0;
    }

    pub fn rotate_keys(&mut self) -> Result<String, String> {
        let new_unix_key = encryption::generate_key();
        let new_browser_key = encryption::generate_key();

        let encrypted_unix = self.encrypt(&new_unix_key)?;
        let encrypted_browser = self.encrypt(&new_browser_key)?;

        self.unix_key = new_unix_key;
        self.browser_key = new_browser_key;
        self.message_count = 0;

        let max_iv = ROTATION_THRESHOLD - self.browser_rotation_buffer;
        let msg = json!({
            "event": "aes_key_rotation",
            "payload": {
                "b64_aes_secret_unix_key": BASE64.encode(&encrypted_unix),
                "b64_aes_secret_browser_key": BASE64.encode(&encrypted_browser),
                "iv_count": 0,
                "max_iv_count": max_iv,
            }
        });

        Ok(msg.to_string())
    }

    pub fn build_aes_keys_message(&mut self, browser_number: u64) -> Result<String, String> {
        let encrypted_unix = self.encrypt_bootstrap(&self.unix_key.clone())?;
        let encrypted_browser = self.encrypt_bootstrap(&self.browser_key.clone())?;

        let iv_count = self.get_start_iv_count(browser_number)?;
        let max_iv_count = self.get_max_iv_for_browser(iv_count)?;

        let msg = json!({
            "event": "aes_keys",
            "payload": {
                "b64_bootstrap_unix_aes_key": BASE64.encode(&encrypted_unix),
                "b64_bootstrap_browser_aes_key": BASE64.encode(&encrypted_browser),
                "iv_count": iv_count,
                "max_iv_count": max_iv_count,
            }
        });

        Ok(msg.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_keys_are_unique() {
        let keys = AesKeys::new();
        assert_ne!(*keys.bootstrap_key, *keys.unix_key);
        assert_ne!(*keys.unix_key, *keys.browser_key);
        assert_ne!(*keys.bootstrap_key, *keys.browser_key);
    }

    #[test]
    fn new_keys_correct_length() {
        let keys = AesKeys::new();
        assert_eq!(
            keys.bootstrap_key.len(),
            termpair_common::constants::KEY_LENGTH_BYTES
        );
        assert_eq!(
            keys.unix_key.len(),
            termpair_common::constants::KEY_LENGTH_BYTES
        );
        assert_eq!(
            keys.browser_key.len(),
            termpair_common::constants::KEY_LENGTH_BYTES
        );
    }

    #[test]
    fn encrypt_decrypt_round_trip() {
        let mut keys = AesKeys::new();
        let plaintext = b"terminal output data";
        let encrypted = keys.encrypt(plaintext).unwrap();
        let decrypted = encryption::decrypt(&keys.unix_key, &encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn bootstrap_encrypt_uses_bootstrap_key() {
        let mut keys = AesKeys::new();
        let plaintext = b"bootstrap data";
        let encrypted = keys.encrypt_bootstrap(plaintext).unwrap();
        let decrypted = encryption::decrypt(&keys.bootstrap_key, &encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn decrypt_uses_browser_key() {
        let keys = AesKeys::new();
        let plaintext = b"browser input";
        let encrypted = encryption::encrypt(1, &keys.browser_key, plaintext).unwrap();
        let decrypted = keys.decrypt(&encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn message_count_increments() {
        let mut keys = AesKeys::new();
        let enc1 = keys.encrypt(b"a").unwrap();
        let enc2 = keys.encrypt(b"a").unwrap();
        assert_ne!(enc1, enc2);
    }

    #[test]
    fn need_rotation_initially_false() {
        let keys = AesKeys::new();
        assert!(!keys.need_rotation());
    }

    #[test]
    fn need_rotation_after_threshold() {
        let mut keys = AesKeys::new();
        keys.message_count = ROTATION_THRESHOLD + 1;
        assert!(keys.need_rotation());
    }

    #[test]
    fn need_rotation_at_threshold() {
        let mut keys = AesKeys::new();
        keys.message_count = ROTATION_THRESHOLD;
        assert!(!keys.need_rotation());
    }

    #[test]
    fn reset_keys_changes_keys() {
        let mut keys = AesKeys::new();
        let old_unix = keys.unix_key.clone();
        let old_browser = keys.browser_key.clone();
        let old_bootstrap = keys.bootstrap_key.clone();
        keys.reset_keys();
        assert_ne!(*keys.unix_key, *old_unix);
        assert_ne!(*keys.browser_key, *old_browser);
        assert_eq!(*keys.bootstrap_key, *old_bootstrap);
        assert_eq!(keys.message_count, 0);
    }

    #[test]
    fn rotate_keys_changes_keys() {
        let mut keys = AesKeys::new();
        let old_unix = keys.unix_key.clone();
        let old_browser = keys.browser_key.clone();
        keys.rotate_keys().unwrap();
        assert_ne!(*keys.unix_key, *old_unix);
        assert_ne!(*keys.browser_key, *old_browser);
        assert_eq!(keys.message_count, 0);
    }

    #[test]
    fn rotate_keys_returns_valid_json() {
        let mut keys = AesKeys::new();
        let msg = keys.rotate_keys().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&msg).unwrap();
        assert_eq!(parsed["event"], "aes_key_rotation");
        assert!(parsed["payload"]["b64_aes_secret_unix_key"].is_string());
        assert!(parsed["payload"]["b64_aes_secret_browser_key"].is_string());
        assert_eq!(parsed["payload"]["iv_count"], 0);
    }

    #[test]
    fn rotate_keys_encrypted_keys_decryptable() {
        let mut keys = AesKeys::new();
        let old_unix = keys.unix_key.clone();
        let msg = keys.rotate_keys().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&msg).unwrap();

        let encrypted_unix = BASE64
            .decode(
                parsed["payload"]["b64_aes_secret_unix_key"]
                    .as_str()
                    .unwrap(),
            )
            .unwrap();
        let decrypted = encryption::decrypt(&old_unix, &encrypted_unix).unwrap();
        assert_eq!(decrypted, *keys.unix_key);
    }

    #[test]
    fn iv_windowing_no_overlap() {
        let keys = AesKeys::new();
        let start1 = keys.get_start_iv_count(1).unwrap();
        let max1 = keys.get_max_iv_for_browser(start1).unwrap();
        let start2 = keys.get_start_iv_count(2).unwrap();
        assert!(
            max1 <= start2,
            "browser 1 max IV {} must not overlap browser 2 start IV {}",
            max1,
            start2
        );
    }

    #[test]
    fn iv_windowing_sequential_browsers() {
        let keys = AesKeys::new();
        for i in 1..10 {
            let start = keys.get_start_iv_count(i).unwrap();
            let max = keys.get_max_iv_for_browser(start).unwrap();
            assert!(max > start);
            if i > 1 {
                let prev_start = keys.get_start_iv_count(i - 1).unwrap();
                assert!(start > prev_start);
            }
        }
    }

    #[test]
    fn iv_windowing_first_browser_starts_at_zero() {
        let keys = AesKeys::new();
        assert_eq!(keys.get_start_iv_count(1).unwrap(), 0);
    }

    #[test]
    fn iv_windowing_window_size() {
        let keys = AesKeys::new();
        let start = keys.get_start_iv_count(1).unwrap();
        let max = keys.get_max_iv_for_browser(start).unwrap();
        let buffer = (ROTATION_THRESHOLD as f64 * 0.1) as u64;
        assert_eq!(max, ROTATION_THRESHOLD - buffer);
    }

    #[test]
    fn build_aes_keys_message_valid_json() {
        let mut keys = AesKeys::new();
        let msg = keys.build_aes_keys_message(1).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&msg).unwrap();
        assert_eq!(parsed["event"], "aes_keys");
        assert!(parsed["payload"]["b64_bootstrap_unix_aes_key"].is_string());
        assert!(parsed["payload"]["b64_bootstrap_browser_aes_key"].is_string());
        assert_eq!(parsed["payload"]["iv_count"], 0);
    }

    #[test]
    fn build_aes_keys_message_keys_decryptable_with_bootstrap() {
        let mut keys = AesKeys::new();
        let msg = keys.build_aes_keys_message(1).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&msg).unwrap();

        let encrypted_unix = BASE64
            .decode(
                parsed["payload"]["b64_bootstrap_unix_aes_key"]
                    .as_str()
                    .unwrap(),
            )
            .unwrap();
        let decrypted = encryption::decrypt(&keys.bootstrap_key, &encrypted_unix).unwrap();
        assert_eq!(decrypted, *keys.unix_key);
    }

    #[test]
    fn nonce_limit_prevents_overflow() {
        let mut keys = AesKeys::new();
        keys.message_count = MAX_MESSAGES_PER_KEY - 1;
        assert!(keys.encrypt(b"test").is_err());
    }
}
