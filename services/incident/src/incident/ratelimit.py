"""In-process sliding-window rate limiter for login attempts.

Tracks failed attempts per username.  On success the counter resets.
The window and max-attempts are configurable via environment variables:

    LOGIN_RATE_WINDOW_SECS   — window length in seconds (default 60)
    LOGIN_RATE_MAX_ATTEMPTS  — failures allowed per window (default 5)

Counters are in-process only — they reset on service restart and are not
shared across replicas.  For multi-replica deployments, replace with a
Redis INCR/EXPIRE counter.
"""
from __future__ import annotations

import os
import threading
import time
from collections import defaultdict

_WINDOW = int(os.environ.get("LOGIN_RATE_WINDOW_SECS", "60"))
_MAX_ATTEMPTS = int(os.environ.get("LOGIN_RATE_MAX_ATTEMPTS", "5"))

_failed: dict[str, list[float]] = defaultdict(list)
_lock = threading.Lock()


def is_allowed(username: str) -> bool:
    """Return True if a login attempt for *username* is permitted."""
    now = time.monotonic()
    cutoff = now - _WINDOW
    with _lock:
        _failed[username] = [t for t in _failed[username] if t > cutoff]
        return len(_failed[username]) < _MAX_ATTEMPTS


def record_failure(username: str) -> None:
    with _lock:
        _failed[username].append(time.monotonic())


def reset(username: str) -> None:
    with _lock:
        _failed.pop(username, None)
