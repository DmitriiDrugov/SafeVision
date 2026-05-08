"""Integration tests for the Incident Service REST API.

Runs the full FastAPI application with:
  - SQLite in-memory database (no Postgres needed)
  - Mocked Redis and MinIO
  - httpx.AsyncClient over ASGITransport

Exercises the full request → DB → response lifecycle including
status transitions, audit log creation, and filter queries.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import AsyncIterator
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from incident.api.routes import ConnectionManager
from incident.auth import UserInfo, get_current_user
from incident.db.models import Base, IncidentModel
from incident.main import app


# ── fixtures ──────────────────────────────────────────────────────────────

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
    storage_mock = MagicMock()
    storage_mock.get_presigned_url = AsyncMock(return_value="http://minio/clip.mp4")

    app.state.db_session_factory = session_factory
    app.state.ws_manager = ConnectionManager()
    app.state.storage = storage_mock

    # Bypass JWT auth for integration tests
    app.dependency_overrides[get_current_user] = lambda: UserInfo(
        username="test-operator", role="operator"
    )

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


async def _seed_incident(
    session_factory,
    **overrides,
) -> IncidentModel:
    defaults = dict(
        rule_id="no_helmet_zone_a",
        camera_id="cam01",
        zone_id="zone_a",
        severity="high",
        status="open",
        detection_payload={"objects": []},
        detected_at=datetime.now(tz=timezone.utc),
    )
    defaults.update(overrides)
    async with session_factory() as db:
        row = IncidentModel(**defaults)
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row


# ── health ────────────────────────────────────────────────────────────────

class TestHealth:
    @pytest.mark.asyncio()
    async def test_health_returns_ok(self, client: AsyncClient) -> None:
        resp = await client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


# ── list & get ────────────────────────────────────────────────────────────

class TestListIncidents:
    @pytest.mark.asyncio()
    async def test_empty_returns_empty_list(self, client: AsyncClient) -> None:
        resp = await client.get("/api/v1/incidents")
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio()
    async def test_returns_seeded_incident(
        self, client: AsyncClient, session_factory
    ) -> None:
        row = await _seed_incident(session_factory)
        resp = await client.get("/api/v1/incidents")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["id"] == row.id
        assert data[0]["severity"] == "high"
        assert data[0]["status"] == "open"

    @pytest.mark.asyncio()
    async def test_filter_by_severity(
        self, client: AsyncClient, session_factory
    ) -> None:
        await _seed_incident(session_factory, severity="high")
        await _seed_incident(session_factory, severity="low")

        resp = await client.get("/api/v1/incidents?severity=high")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["severity"] == "high"

    @pytest.mark.asyncio()
    async def test_filter_by_status(
        self, client: AsyncClient, session_factory
    ) -> None:
        await _seed_incident(session_factory, status="open")
        await _seed_incident(session_factory, status="resolved")

        resp = await client.get("/api/v1/incidents?status=open")
        assert resp.status_code == 200
        data = resp.json()
        assert all(d["status"] == "open" for d in data)

    @pytest.mark.asyncio()
    async def test_filter_by_camera_id(
        self, client: AsyncClient, session_factory
    ) -> None:
        await _seed_incident(session_factory, camera_id="cam01")
        await _seed_incident(session_factory, camera_id="cam02")

        resp = await client.get("/api/v1/incidents?camera_id=cam01")
        assert resp.status_code == 200
        data = resp.json()
        assert all(d["camera_id"] == "cam01" for d in data)

    @pytest.mark.asyncio()
    async def test_pagination(
        self, client: AsyncClient, session_factory
    ) -> None:
        for _ in range(15):
            await _seed_incident(session_factory)

        page1 = await client.get("/api/v1/incidents?page=1&page_size=10")
        assert page1.status_code == 200
        assert len(page1.json()) == 10

        page2 = await client.get("/api/v1/incidents?page=2&page_size=10")
        assert page2.status_code == 200
        assert len(page2.json()) == 5


class TestGetIncident:
    @pytest.mark.asyncio()
    async def test_get_returns_incident(
        self, client: AsyncClient, session_factory
    ) -> None:
        row = await _seed_incident(session_factory)
        resp = await client.get(f"/api/v1/incidents/{row.id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == row.id

    @pytest.mark.asyncio()
    async def test_get_unknown_returns_404(self, client: AsyncClient) -> None:
        resp = await client.get("/api/v1/incidents/does-not-exist")
        assert resp.status_code == 404


# ── lifecycle transitions ─────────────────────────────────────────────────

class TestAcknowledge:
    @pytest.mark.asyncio()
    async def test_acknowledge_open_incident(
        self, client: AsyncClient, session_factory
    ) -> None:
        row = await _seed_incident(session_factory, status="open")
        resp = await client.post(
            f"/api/v1/incidents/{row.id}/acknowledge",
            json={"actor": "operator1", "note": "Checking now"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "acknowledged"
        assert data["acknowledged_by"] == "operator1"

    @pytest.mark.asyncio()
    async def test_acknowledge_already_resolved_returns_409(
        self, client: AsyncClient, session_factory
    ) -> None:
        row = await _seed_incident(session_factory, status="resolved")
        resp = await client.post(
            f"/api/v1/incidents/{row.id}/acknowledge",
            json={"actor": "op"},
        )
        assert resp.status_code == 409


class TestResolve:
    @pytest.mark.asyncio()
    async def test_resolve_acknowledged_incident(
        self, client: AsyncClient, session_factory
    ) -> None:
        row = await _seed_incident(session_factory, status="acknowledged")
        resp = await client.post(
            f"/api/v1/incidents/{row.id}/resolve",
            json={"actor": "supervisor"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "resolved"

    @pytest.mark.asyncio()
    async def test_resolve_open_incident_directly(
        self, client: AsyncClient, session_factory
    ) -> None:
        row = await _seed_incident(session_factory, status="open")
        resp = await client.post(
            f"/api/v1/incidents/{row.id}/resolve",
            json={"actor": "supervisor"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "resolved"

    @pytest.mark.asyncio()
    async def test_resolve_already_resolved_returns_409(
        self, client: AsyncClient, session_factory
    ) -> None:
        row = await _seed_incident(session_factory, status="resolved")
        resp = await client.post(
            f"/api/v1/incidents/{row.id}/resolve",
            json={"actor": "supervisor"},
        )
        assert resp.status_code == 409


class TestFalsePositive:
    @pytest.mark.asyncio()
    async def test_mark_open_as_false_positive(
        self, client: AsyncClient, session_factory
    ) -> None:
        row = await _seed_incident(session_factory, status="open")
        resp = await client.post(
            f"/api/v1/incidents/{row.id}/false-positive",
            json={"actor": "reviewer"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "false_positive"

    @pytest.mark.asyncio()
    async def test_mark_already_fp_returns_409(
        self, client: AsyncClient, session_factory
    ) -> None:
        row = await _seed_incident(session_factory, status="false_positive")
        resp = await client.post(
            f"/api/v1/incidents/{row.id}/false-positive",
            json={"actor": "reviewer"},
        )
        assert resp.status_code == 409


# ── full lifecycle ────────────────────────────────────────────────────────

class TestFullLifecycle:
    @pytest.mark.asyncio()
    async def test_open_acknowledge_resolve(
        self, client: AsyncClient, session_factory
    ) -> None:
        """Realistic operator workflow: open → acknowledge → resolve."""
        row = await _seed_incident(session_factory, status="open", severity="critical")
        iid = row.id

        # Step 1: acknowledge
        r1 = await client.post(
            f"/api/v1/incidents/{iid}/acknowledge",
            json={"actor": "operator1"},
        )
        assert r1.status_code == 200
        assert r1.json()["status"] == "acknowledged"

        # Step 2: resolve
        r2 = await client.post(
            f"/api/v1/incidents/{iid}/resolve",
            json={"actor": "supervisor", "note": "Fixed — guard rail reinstalled"},
        )
        assert r2.status_code == 200
        assert r2.json()["status"] == "resolved"

        # Verify final state via GET
        r3 = await client.get(f"/api/v1/incidents/{iid}")
        assert r3.json()["status"] == "resolved"

    @pytest.mark.asyncio()
    async def test_false_positive_cannot_be_resolved(
        self, client: AsyncClient, session_factory
    ) -> None:
        row = await _seed_incident(session_factory, status="false_positive")
        resp = await client.post(
            f"/api/v1/incidents/{row.id}/resolve",
            json={"actor": "supervisor"},
        )
        assert resp.status_code == 409
