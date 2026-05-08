"""Unit tests for RTSP URL encryption."""
from __future__ import annotations

import os

import pytest


@pytest.fixture(autouse=True)
def _set_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-for-unit-tests")


class TestEncryptDecrypt:
    def test_roundtrip(self) -> None:
        from incident.crypto import decrypt_url, encrypt_url

        url = "rtsp://user:pass@camera.local:554/stream1"
        assert decrypt_url(encrypt_url(url)) == url

    def test_encrypted_differs_from_plaintext(self) -> None:
        from incident.crypto import encrypt_url

        url = "rtsp://host/cam"
        assert encrypt_url(url) != url

    def test_ciphertext_is_not_rtsp_prefix(self) -> None:
        from incident.crypto import encrypt_url

        encrypted = encrypt_url("rtsp://host/cam")
        assert not encrypted.startswith("rtsp://")

    def test_two_encryptions_differ(self) -> None:
        """Fernet uses a random IV so the same plaintext produces different ciphertexts."""
        from incident.crypto import encrypt_url

        url = "rtsp://host/cam"
        assert encrypt_url(url) != encrypt_url(url)

    def test_wrong_key_falls_back_to_input(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from incident.crypto import decrypt_url, encrypt_url

        ciphertext = encrypt_url("rtsp://host/cam")
        monkeypatch.setenv("SECRET_KEY", "different-secret-key")
        # Should not raise; returns the ciphertext unchanged
        result = decrypt_url(ciphertext)
        assert result == ciphertext

    def test_plaintext_passthrough(self) -> None:
        """Plaintext URLs (pre-migration) are returned unchanged by decrypt_url."""
        from incident.crypto import decrypt_url

        url = "rtsp://host/cam"
        assert decrypt_url(url) == url

    def test_empty_string_passthrough(self) -> None:
        from incident.crypto import decrypt_url

        assert decrypt_url("") == ""


class TestMissingKey:
    def test_encrypt_raises_without_secret_key(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("SECRET_KEY", raising=False)
        from incident.crypto import encrypt_url

        with pytest.raises(RuntimeError, match="SECRET_KEY"):
            encrypt_url("rtsp://host/cam")

    def test_decrypt_raises_without_secret_key(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("SECRET_KEY", raising=False)
        from incident.crypto import decrypt_url

        # Must not silently swallow the RuntimeError — it should propagate
        with pytest.raises(RuntimeError, match="SECRET_KEY"):
            decrypt_url("some-ciphertext")
