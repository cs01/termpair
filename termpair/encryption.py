"""
Symmetric encryption with aes gcm
https://cryptography.io/en/latest/hazmat/primitives/aead/#cryptography.hazmat.primitives.ciphers.aead.AESGCM
"""

import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

IV_LENGTH = 12
KEY_LENGTH_BITS = 128


def gen_key() -> bytes:
    return AESGCM.generate_key(bit_length=KEY_LENGTH_BITS)


def encrypt(key: bytes, data: bytes) -> bytes:
    # the same iv must never be reused with a given key
    iv = os.urandom(IV_LENGTH)
    # prepend unencrypted iv to the encrypted payload
    return iv + AESGCM(key).encrypt(iv, data, None)


def decrypt(key: bytes, data: bytes) -> str:
    # unencrypted iv must be prepended to the payload
    iv = data[0:IV_LENGTH]
    return AESGCM(key).decrypt(iv, data[IV_LENGTH:], None).decode()
