"""Unit tests for the login rate limiter."""
from __future__ import annotations

import time

import pytest

import incident.ratelimit as rl


@pytest.fixture(autouse=True)
def _reset_state():
    """Clear the shared failed-attempts dict before each test."""
    rl._failed.clear()
    yield
    rl._failed.clear()


class TestIsAllowed:
    def test_first_attempt_always_allowed(self) -> None:
        assert rl.is_allowed("alice") is True

    def test_allowed_below_threshold(self) -> None:
        for _ in range(rl._MAX_ATTEMPTS - 1):
            rl.record_failure("bob")
        assert rl.is_allowed("bob") is True

    def test_blocked_at_threshold(self) -> None:
        for _ in range(rl._MAX_ATTEMPTS):
            rl.record_failure("carol")
        assert rl.is_allowed("carol") is False

    def test_different_users_are_independent(self) -> None:
        for _ in range(rl._MAX_ATTEMPTS):
            rl.record_failure("dave")
        assert rl.is_allowed("eve") is True

    def test_old_failures_expire_from_window(self) -> None:
        """Failures older than the window must not count against the limit."""
        past = time.monotonic() - rl._WINDOW - 1
        with rl._lock:
            rl._failed["frank"] = [past] * rl._MAX_ATTEMPTS
        # All recorded failures are outside the window → should be allowed
        assert rl.is_allowed("frank") is True


class TestRecordFailure:
    def test_failure_increments_counter(self) -> None:
        rl.record_failure("grace")
        rl.record_failure("grace")
        with rl._lock:
            assert len(rl._failed["grace"]) == 2

    def test_failure_timestamps_are_recent(self) -> None:
        before = time.monotonic()
        rl.record_failure("heidi")
        after = time.monotonic()
        with rl._lock:
            ts = rl._failed["heidi"][0]
        assert before <= ts <= after


class TestReset:
    def test_reset_clears_failures(self) -> None:
        for _ in range(rl._MAX_ATTEMPTS):
            rl.record_failure("ivan")
        assert rl.is_allowed("ivan") is False

        rl.reset("ivan")
        assert rl.is_allowed("ivan") is True

    def test_reset_unknown_user_is_safe(self) -> None:
        rl.reset("judy")   # must not raise


class TestWindowSliding:
    def test_new_failure_after_reset_starts_fresh_window(self) -> None:
        for _ in range(rl._MAX_ATTEMPTS):
            rl.record_failure("karl")
        rl.reset("karl")
        rl.record_failure("karl")
        assert rl.is_allowed("karl") is True
