use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes128Gcm, Nonce};
use rand::rngs::OsRng;
use rand::RngCore;
use zeroize::Zeroizing;

use crate::constants::{IV_LENGTH, KEY_LENGTH_BYTES};

pub fn generate_key() -> Zeroizing<Vec<u8>> {
    let mut key = Zeroizing::new(vec![0u8; KEY_LENGTH_BYTES]);
    OsRng.fill_bytes(&mut key);
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

    #[test]
    fn encrypt_decrypt_empty_data() {
        let key = generate_key();
        let encrypted = encrypt(0, &key, b"").unwrap();
        let decrypted = decrypt(&key, &encrypted).unwrap();
        assert_eq!(decrypted, b"");
    }

    #[test]
    fn encrypt_decrypt_large_data() {
        let key = generate_key();
        let plaintext = vec![0xAB; 64 * 1024];
        let encrypted = encrypt(0, &key, &plaintext).unwrap();
        let decrypted = decrypt(&key, &encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn ciphertext_includes_iv_prefix() {
        let key = generate_key();
        let encrypted = encrypt(42, &key, b"test").unwrap();
        assert!(encrypted.len() > IV_LENGTH);
        let expected_iv = iv_from_count(42);
        assert_eq!(&encrypted[..IV_LENGTH], &expected_iv);
    }

    #[test]
    fn decrypt_too_short_fails() {
        let key = generate_key();
        let short = vec![0u8; IV_LENGTH - 1];
        assert!(decrypt(&key, &short).is_err());
    }

    #[test]
    fn decrypt_truncated_ciphertext_fails() {
        let key = generate_key();
        let encrypted = encrypt(0, &key, b"hello").unwrap();
        let truncated = &encrypted[..encrypted.len() - 1];
        assert!(decrypt(&key, truncated).is_err());
    }

    #[test]
    fn decrypt_tampered_ciphertext_fails() {
        let key = generate_key();
        let mut encrypted = encrypt(0, &key, b"hello").unwrap();
        let last = encrypted.len() - 1;
        encrypted[last] ^= 0xFF;
        assert!(decrypt(&key, &encrypted).is_err());
    }

    #[test]
    fn invalid_key_length_fails() {
        let short_key = vec![0u8; 8];
        assert!(encrypt(0, &short_key, b"test").is_err());
        assert!(decrypt(&short_key, &vec![0u8; 32]).is_err());
    }

    #[test]
    fn generate_key_length() {
        let key = generate_key();
        assert_eq!(key.len(), KEY_LENGTH_BYTES);
    }

    #[test]
    fn generate_key_unique() {
        let k1 = generate_key();
        let k2 = generate_key();
        assert_ne!(*k1, *k2);
    }

    #[test]
    fn iv_from_count_zero() {
        let iv = iv_from_count(0);
        assert_eq!(iv, [0u8; IV_LENGTH]);
    }

    #[test]
    fn iv_from_count_max_u64() {
        let iv = iv_from_count(u64::MAX);
        let mut expected = [0u8; IV_LENGTH];
        expected[..8].copy_from_slice(&u64::MAX.to_le_bytes());
        assert_eq!(iv, expected);
    }

    #[test]
    fn encrypt_at_high_message_count() {
        let key = generate_key();
        let encrypted = encrypt(1_000_000, &key, b"high count").unwrap();
        let decrypted = decrypt(&key, &encrypted).unwrap();
        assert_eq!(decrypted, b"high count");
    }
}
