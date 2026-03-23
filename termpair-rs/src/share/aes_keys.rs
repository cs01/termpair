use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde_json::json;
use zeroize::Zeroizing;

use crate::constants::{JS_MAX_SAFE_INTEGER, MAX_MESSAGES_PER_KEY, ROTATION_THRESHOLD};
use crate::encryption;

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

    pub fn rotate_keys(&mut self) -> Result<String, String> {
        let new_unix_key = encryption::generate_key();
        let new_browser_key = encryption::generate_key();

        let encrypted_unix = self.encrypt(&new_unix_key)?;
        let encrypted_browser = self.encrypt(&new_browser_key)?;

        let msg = json!({
            "event": "aes_key_rotation",
            "payload": {
                "b64_aes_secret_unix_key": BASE64.encode(&encrypted_unix),
                "b64_aes_secret_browser_key": BASE64.encode(&encrypted_browser),
            }
        });

        self.unix_key = new_unix_key;
        self.browser_key = new_browser_key;
        self.message_count = 0;

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
