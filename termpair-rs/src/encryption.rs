use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes128Gcm, Nonce};
use rand::RngCore;

use crate::constants::{IV_LENGTH, KEY_LENGTH_BYTES};

pub fn generate_key() -> Vec<u8> {
    let mut key = vec![0u8; KEY_LENGTH_BYTES];
    rand::thread_rng().fill_bytes(&mut key);
    key
}

pub fn iv_from_count(count: u64) -> [u8; IV_LENGTH] {
    let mut iv = [0u8; IV_LENGTH];
    let bytes = count.to_le_bytes();
    iv[..bytes.len()].copy_from_slice(&bytes);
    iv
}

pub fn encrypt(message_count: u64, key: &[u8], data: &[u8]) -> Result<Vec<u8>, String> {
    let cipher =
        Aes128Gcm::new_from_slice(key).map_err(|e| format!("invalid key: {}", e))?;
    let iv = iv_from_count(message_count);
    let nonce = Nonce::from_slice(&iv);
    let ciphertext = cipher
        .encrypt(nonce, data)
        .map_err(|e| format!("encryption failed: {}", e))?;
    let mut result = Vec::with_capacity(IV_LENGTH + ciphertext.len());
    result.extend_from_slice(&iv);
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

pub fn decrypt(key: &[u8], data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < IV_LENGTH {
        return Err("ciphertext too short".into());
    }
    let cipher =
        Aes128Gcm::new_from_slice(key).map_err(|e| format!("invalid key: {}", e))?;
    let iv = &data[..IV_LENGTH];
    let nonce = Nonce::from_slice(iv);
    let plaintext = cipher
        .decrypt(nonce, &data[IV_LENGTH..])
        .map_err(|e| format!("decryption failed: {}", e))?;
    Ok(plaintext)
}
