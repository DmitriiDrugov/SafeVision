"""Tests for the Incident Service REST API."""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import AsyncClient

from incident.db.models import IncidentModel

# ── helpers ───────────────────────────────────────────────────────────────

def _make_incident(**kwargs) -> IncidentModel:
    defaults = dict(
        rule_id="test_rule",
        camera_id="cam01",
        zone_id="zone_a",
        severity="high",
        status="open",
        detection_payload={},
        detected_at=datetime.now(tz=UTC),
    )
    defaults.update(kwargs)
    return IncidentModel(**defaults)


@pytest_asyncio.fixture()
async def one_incident(session_factory):
    async with session_factory() as db:
        row = _make_incident()
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row


# ── health ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio()
async def test_health(client: AsyncClient) -> None:
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


# ── list incidents ────────────────────────────────────────────────────────

@pytest.mark.asyncio()
async def test_list_incidents_empty(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/incidents")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio()
async def test_list_incidents_returns_rows(
    client: AsyncClient, one_incident: IncidentModel
) -> None:
    resp = await client.get("/api/v1/incidents")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == one_incident.id
    assert data[0]["severity"] == "high"
    assert data[0]["status"] == "open"


@pytest.mark.asyncio()
async def test_list_incidents_pagination(client: AsyncClient, session_factory) -> None:
    async with session_factory() as db:
        for _ in range(55):
            db.add(_make_incident())
        await db.commit()

    resp = await client.get("/api/v1/incidents?page=1&page_size=50")
    assert resp.status_code == 200
    assert len(resp.json()) == 50

    resp2 = await client.get("/api/v1/incidents?page=2&page_size=50")
    assert resp2.status_code == 200
    assert len(resp2.json()) == 5


@pytest.mark.asyncio()
async def test_list_incidents_filter_by_severity(
    client: AsyncClient, session_factory
) -> None:
    async with session_factory() as db:
        db.add(_make_incident(severity="low"))
        db.add(_make_incident(severity="critical"))
        await db.commit()

    resp = await client.get("/api/v1/incidents?severity=critical")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["severity"] == "critical"


# ── get incident ──────────────────────────────────────────────────────────

@pytest.mark.asyncio()
async def test_get_incident(client: AsyncClient, one_incident: IncidentModel) -> None:
    resp = await client.get(f"/api/v1/incidents/{one_incident.id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == one_incident.id


@pytest.mark.asyncio()
async def test_get_nonexistent_incident(client: AsyncClient) -> None:
    resp = await client.get(f"/api/v1/incidents/{uuid4()}")
    assert resp.status_code == 404


# ── acknowledge ───────────────────────────────────────────────────────────

@pytest.mark.asyncio()
async def test_acknowledge_incident(
    client: AsyncClient, one_incident: IncidentModel
) -> None:
    resp = await client.post(
        f"/api/v1/incidents/{one_incident.id}/acknowledge",
        json={"actor": "alice", "note": "verified on camera"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "acknowledged"
    assert data["acknowledged_by"] == "alice"
    assert data["acknowledged_at"] is not None


@pytest.mark.asyncio()
async def test_acknowledge_nonexistent_incident(client: AsyncClient) -> None:
    resp = await client.post(
        f"/api/v1/incidents/{uuid4()}/acknowledge", json={"actor": "alice"}
    )
    assert resp.status_code == 404


@pytest.mark.asyncio()
async def test_acknowledge_already_resolved(
    client: AsyncClient, session_factory
) -> None:
    async with session_factory() as db:
        row = _make_incident(status="resolved")
        db.add(row)
        await db.commit()
        incident_id = row.id

    resp = await client.post(
        f"/api/v1/incidents/{incident_id}/acknowledge", json={"actor": "bob"}
    )
    assert resp.status_code == 409


# ── resolve ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio()
async def test_resolve_incident(
    client: AsyncClient, one_incident: IncidentModel
) -> None:
    resp = await client.post(
        f"/api/v1/incidents/{one_incident.id}/resolve", json={"actor": "carol"}
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "resolved"


@pytest.mark.asyncio()
async def test_resolve_acknowledged_incident(
    client: AsyncClient, session_factory
) -> None:
    async with session_factory() as db:
        row = _make_incident(status="acknowledged")
        db.add(row)
        await db.commit()
        incident_id = row.id

    resp = await client.post(
        f"/api/v1/incidents/{incident_id}/resolve", json={"actor": "dave"}
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "resolved"


# ── false positive ────────────────────────────────────────────────────────

@pytest.mark.asyncio()
async def test_mark_false_positive(
    client: AsyncClient, one_incident: IncidentModel
) -> None:
    resp = await client.post(
        f"/api/v1/incidents/{one_incident.id}/false-positive",
        json={"actor": "eve"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "false_positive"


@pytest.mark.asyncio()
async def test_mark_false_positive_idempotency_blocked(
    client: AsyncClient, session_factory
) -> None:
    async with session_factory() as db:
        row = _make_incident(status="false_positive")
        db.add(row)
        await db.commit()
        incident_id = row.id

    resp = await client.post(
        f"/api/v1/incidents/{incident_id}/false-positive", json={"actor": "eve"}
    )
    assert resp.status_code == 409
