"""RTSP URL encryption using Fernet symmetric encryption.

The SECRET_KEY environment variable is hashed with SHA-256 to produce a
stable 32-byte Fernet key. Encrypted values are stored in the DB as Fernet
ciphertexts (starting with "gAAAAAB"). Decryption silently falls back to
returning the value unchanged so that plaintext URLs written before this
module was introduced continue to work until they are re-saved.
"""
from __future__ import annotations

import base64
import hashlib
import os

from cryptography.fernet import Fernet, InvalidToken


def _make_fernet() -> Fernet:
    secret = os.environ.get("SECRET_KEY", "")
    if not secret:
        raise RuntimeError("SECRET_KEY is required for RTSP URL encryption")
    digest = hashlib.sha256(secret.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_url(url: str) -> str:
    """Encrypt an RTSP URL for DB storage. Returns a Fernet ciphertext string."""
    return _make_fernet().encrypt(url.encode()).decode()


def decrypt_url(value: str) -> str:
    """Decrypt a stored RTSP URL.

    Returns the original value unchanged when decryption fails so that
    plaintext URLs written before encryption was introduced remain readable.
    """
    try:
        return _make_fernet().decrypt(value.encode()).decode()
    except (InvalidToken, ValueError):
        # Fernet raises InvalidToken for wrong key / bad ciphertext.
        # ValueError / binascii.Error for non-base64 input (plaintext URLs).
        return value
