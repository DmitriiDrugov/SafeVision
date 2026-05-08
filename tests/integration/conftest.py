"""Integration test configuration.

Tests require a running Redis instance. Set REDIS_URL to point at it;
defaults to redis://localhost:6379 (matches the GitHub Actions service
container defined in ci.yml).

Shared service source trees are added to sys.path so imports work without
a full editable install of every service in one environment.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
import pytest_asyncio
import redis.asyncio as aioredis

# ── path setup ────────────────────────────────────────────────────────────
_ROOT = Path(__file__).parent.parent.parent
_SHARED = _ROOT / "shared"
sys.path.insert(0, str(_SHARED / "schemas"))
sys.path.insert(0, str(_SHARED / "proto"))
sys.path.insert(0, str(_ROOT / "services" / "rule-engine" / "src"))
sys.path.insert(0, str(_ROOT / "services" / "incident" / "src"))
sys.path.insert(0, str(_ROOT / "services" / "notification" / "src"))

_REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")


@pytest_asyncio.fixture()
async def redis_client():
    """Async Redis client connected to the test Redis instance."""
    client = await aioredis.from_url(_REDIS_URL, decode_responses=True)
    yield client
    await client.aclose()


@pytest_asyncio.fixture(autouse=True)
async def flush_test_streams(redis_client: aioredis.Redis):
    """Delete test streams before each test to prevent cross-test pollution."""
    yield
    # cleanup after test; ignore errors (stream may not exist)
    for key in await redis_client.keys("test:*"):
        await redis_client.delete(key)
