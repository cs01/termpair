use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes128Gcm, Nonce};
use rand::RngCore;
use zeroize::Zeroizing;

use crate::constants::{IV_LENGTH, KEY_LENGTH_BYTES};

pub fn generate_key() -> Zeroizing<Vec<u8>> {
    let mut key = Zeroizing::new(vec![0u8; KEY_LENGTH_BYTES]);
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
    let cipher = Aes128Gcm::new_from_slice(key).map_err(|e| format!("invalid key: {}", e))?;
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
    let cipher = Aes128Gcm::new_from_slice(key).map_err(|e| format!("invalid key: {}", e))?;
    let iv = &data[..IV_LENGTH];
    let nonce = Nonce::from_slice(iv);
    let plaintext = cipher
        .decrypt(nonce, &data[IV_LENGTH..])
        .map_err(|e| format!("decryption failed: {}", e))?;
    Ok(plaintext)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_decrypt_round_trip() {
        let key = generate_key();
        let plaintext = b"hello termpair";
        let encrypted = encrypt(0, &key, plaintext).unwrap();
        let decrypted = decrypt(&key, &encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn decrypt_with_wrong_key_fails() {
        let key = generate_key();
        let wrong_key = generate_key();
        let encrypted = encrypt(0, &key, b"secret").unwrap();
        assert!(decrypt(&wrong_key, &encrypted).is_err());
    }

    #[test]
    fn iv_counter_increments() {
        let iv0 = iv_from_count(0);
        let iv1 = iv_from_count(1);
        let iv2 = iv_from_count(2);
        assert_ne!(iv0, iv1);
        assert_ne!(iv1, iv2);
        assert_eq!(iv0[0], 0);
        assert_eq!(iv1[0], 1);
        assert_eq!(iv2[0], 2);
    }

    #[test]
    fn different_ivs_produce_different_ciphertext() {
        let key = generate_key();
        let plaintext = b"same data";
        let enc0 = encrypt(0, &key, plaintext).unwrap();
        let enc1 = encrypt(1, &key, plaintext).unwrap();
        assert_ne!(enc0, enc1);
        assert_eq!(decrypt(&key, &enc0).unwrap(), plaintext);
        assert_eq!(decrypt(&key, &enc1).unwrap(), plaintext);
    }
}
