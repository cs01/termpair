"""
Symmetric encryption with aes gcm
https://cryptography.io/en/latest/hazmat/primitives/aead/#cryptography.hazmat.primitives.ciphers.aead.AESGCM
"""

from cryptography.hazmat.primitives.ciphers.aead import AESGCM  # type: ignore
from cryptography.hazmat.primitives.asymmetric import rsa, padding  # type:ignore
from cryptography.hazmat.primitives import hashes  # type:ignore
from cryptography.hazmat.primitives.serialization import (  # type:ignore
    load_pem_public_key,
)

IV_LENGTH = 12
KEY_LENGTH_BITS = 128


def import_rsa_key(pem_public_key: str):
    pem_bytes = pem_public_key.encode()
    return load_pem_public_key(pem_bytes)


def rsa_encrypt(public_key: rsa.RSAPublicKey, message: bytes) -> bytes:
    return public_key.encrypt(
        message,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )


def aes_generate_secret_key() -> bytes:
    return AESGCM.generate_key(bit_length=KEY_LENGTH_BITS)


def aes_encrypt(message_count: int, key: bytes, data: bytes) -> bytes:
    # the same iv must never be reused with a given key
    iv = message_count.to_bytes(IV_LENGTH, "little")
    # prepend unencrypted iv to the encrypted payload
    return iv + AESGCM(key).encrypt(iv, data, None)


def aes_decrypt(key: bytes, data: bytes) -> str:
    # unencrypted iv must be prepended to the payload
    iv = data[0:IV_LENGTH]
    return AESGCM(key).decrypt(iv, data[IV_LENGTH:], None).decode()
