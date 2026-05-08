"""Incident Service REST + WebSocket routes."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from incident.db.models import AuditLogModel, IncidentModel

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/incidents", tags=["incidents"])


# ── Response models ───────────────────────────────────────────────────────

class IncidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    rule_id: str
    camera_id: str
    zone_id: str
    severity: str
    status: str
    acknowledged_by: str | None
    acknowledged_at: datetime | None
    resolved_at: datetime | None
    clip_url: str | None
    detection_payload: dict[str, Any]
    detected_at: datetime
    created_at: datetime
    updated_at: datetime


class StatusUpdateBody(BaseModel):
    actor: str
    note: str | None = None


# ── DB session dependency ─────────────────────────────────────────────────

async def _get_db(request: Request) -> AsyncSession:  # type: ignore[return]
    async with request.app.state.db_session_factory() as session:
        yield session


DBSession = Annotated[AsyncSession, Depends(_get_db)]


# ── Helpers ───────────────────────────────────────────────────────────────

async def _get_incident_or_404(incident_id: str, db: AsyncSession) -> IncidentModel:
    row = await db.get(IncidentModel, incident_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    return row


async def _write_audit(
    db: AsyncSession,
    incident_id: str,
    actor: str,
    action: str,
    note: str | None,
    before: str,
    after: str,
) -> None:
    entry = AuditLogModel(
        incident_id=incident_id,
        actor=actor,
        action=action,
        note=note,
        before_status=before,
        after_status=after,
    )
    db.add(entry)


# ── Endpoints ─────────────────────────────────────────────────────────────

@router.get("", response_model=list[IncidentOut])
async def list_incidents(
    db: DBSession,
    from_dt: datetime | None = Query(default=None),
    to_dt: datetime | None = Query(default=None),
    severity: str | None = Query(default=None),
    status: str | None = Query(default=None),
    camera_id: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
) -> list[IncidentOut]:
    stmt = select(IncidentModel).order_by(IncidentModel.detected_at.desc())
    if from_dt:
        stmt = stmt.where(IncidentModel.detected_at >= from_dt)
    if to_dt:
        stmt = stmt.where(IncidentModel.detected_at <= to_dt)
    if severity:
        stmt = stmt.where(IncidentModel.severity == severity)
    if status:
        stmt = stmt.where(IncidentModel.status == status)
    if camera_id:
        stmt = stmt.where(IncidentModel.camera_id == camera_id)
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [IncidentOut.model_validate(r) for r in rows]


@router.get("/{incident_id}", response_model=IncidentOut)
async def get_incident(incident_id: str, db: DBSession) -> IncidentOut:
    row = await _get_incident_or_404(incident_id, db)
    return IncidentOut.model_validate(row)


@router.post("/{incident_id}/acknowledge", response_model=IncidentOut)
async def acknowledge_incident(
    incident_id: str, body: StatusUpdateBody, db: DBSession
) -> IncidentOut:
    row = await _get_incident_or_404(incident_id, db)
    if row.status not in ("open",):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot acknowledge incident with status '{row.status}'",
        )
    before = row.status
    row.status = "acknowledged"
    row.acknowledged_by = body.actor
    row.acknowledged_at = datetime.now(tz=timezone.utc)
    await _write_audit(db, incident_id, body.actor, "acknowledge", body.note, before, "acknowledged")
    await db.commit()
    await db.refresh(row)
    return IncidentOut.model_validate(row)


@router.post("/{incident_id}/resolve", response_model=IncidentOut)
async def resolve_incident(
    incident_id: str, body: StatusUpdateBody, db: DBSession
) -> IncidentOut:
    row = await _get_incident_or_404(incident_id, db)
    if row.status not in ("open", "acknowledged"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot resolve incident with status '{row.status}'",
        )
    before = row.status
    row.status = "resolved"
    row.resolved_at = datetime.now(tz=timezone.utc)
    await _write_audit(db, incident_id, body.actor, "resolve", body.note, before, "resolved")
    await db.commit()
    await db.refresh(row)
    return IncidentOut.model_validate(row)


@router.post("/{incident_id}/false-positive", response_model=IncidentOut)
async def mark_false_positive(
    incident_id: str, body: StatusUpdateBody, db: DBSession
) -> IncidentOut:
    row = await _get_incident_or_404(incident_id, db)
    if row.status == "false_positive":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Incident is already marked as false positive",
        )
    before = row.status
    row.status = "false_positive"
    await _write_audit(db, incident_id, body.actor, "false_positive", body.note, before, "false_positive")
    await db.commit()
    await db.refresh(row)
    return IncidentOut.model_validate(row)


# ── WebSocket ─────────────────────────────────────────────────────────────

@router.websocket("/stream")
async def incidents_stream(websocket: WebSocket, request: Request) -> None:
    manager: ConnectionManager = request.app.state.ws_manager
    await manager.connect(websocket)

    # Send initial payload: last 10 open incidents
    async with request.app.state.db_session_factory() as db:
        stmt = (
            select(IncidentModel)
            .where(IncidentModel.status == "open")
            .order_by(IncidentModel.detected_at.desc())
            .limit(10)
        )
        result = await db.execute(stmt)
        initial = [IncidentOut.model_validate(r).model_dump_json() for r in result.scalars()]

    try:
        for payload in initial:
            await websocket.send_text(payload)
        while True:
            # Keep connection alive; broadcast happens via ConnectionManager
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# ── Connection manager ────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.add(ws)
        logger.debug("ws.connected", total=len(self._connections))

    def disconnect(self, ws: WebSocket) -> None:
        self._connections.discard(ws)
        logger.debug("ws.disconnected", total=len(self._connections))

    async def broadcast(self, message: str) -> None:
        dead: set[WebSocket] = set()
        for ws in self._connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)
        self._connections -= dead
