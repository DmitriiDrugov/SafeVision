"""Pytest configuration for incident service tests.

Uses an in-memory SQLite database (via aiosqlite) and mocked external
dependencies (Redis, MinIO) so tests run without Docker.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import AsyncIterator
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Path setup
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
_shared = Path(__file__).parent.parent.parent.parent / "shared"
sys.path.insert(0, str(_shared / "schemas"))
sys.path.insert(0, str(_shared / "proto"))

from incident.api.routes import ConnectionManager
from incident.db.models import Base
from incident.main import app


@pytest_asyncio.fixture()
async def db_engine():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture()
async def session_factory(db_engine):
    return async_sessionmaker(db_engine, expire_on_commit=False)


@pytest_asyncio.fixture()
async def client(session_factory) -> AsyncIterator[AsyncClient]:
    ws_manager = ConnectionManager()
    storage_mock = MagicMock()
    storage_mock.get_presigned_url = AsyncMock(return_value="http://minio/test-url")

    app.state.db_session_factory = session_factory
    app.state.ws_manager = ws_manager
    app.state.storage = storage_mock

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
