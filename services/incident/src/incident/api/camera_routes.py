"""Camera and zone management REST API for the Incident Service."""
from __future__ import annotations

import json
from typing import Any

import redis.asyncio as aioredis
import structlog
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from incident.db.models import CameraModel

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/cameras", tags=["cameras"])

_CAMERA_CONFIG_KEY = "safevision:cameras"


# ── Request / Response models ─────────────────────────────────────────────

class ZoneIn(BaseModel):
    id: str
    name: str
    polygon: list[tuple[float, float]] = Field(..., min_length=3)


class CameraIn(BaseModel):
    id: str
    name: str
    rtsp_url: str
    enabled: bool = True
    zones: list[ZoneIn] = Field(default_factory=list)


class CameraUpdate(BaseModel):
    name: str | None = None
    rtsp_url: str | None = None
    enabled: bool | None = None
    zones: list[ZoneIn] | None = None


class CameraOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    rtsp_url: str
    enabled: bool
    zones: list[dict[str, Any]]


# ── Helpers ───────────────────────────────────────────────────────────────

async def _get_session(request: Request) -> AsyncSession:
    return request.app.state.db_session_factory()


async def _publish_camera_config(redis_client: aioredis.Redis, db: AsyncSession) -> None:
    """Write current camera list to Redis so Inference can load zone config."""
    result = await db.execute(select(CameraModel).where(CameraModel.enabled == True))  # noqa: E712
    cameras = result.scalars().all()
    payload = [
        {"id": c.id, "name": c.name, "rtsp_url": c.rtsp_url, "zones": c.zones}
        for c in cameras
    ]
    await redis_client.set(_CAMERA_CONFIG_KEY, json.dumps(payload))


# ── Routes ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[CameraOut])
async def list_cameras(request: Request) -> list[CameraModel]:
    async with request.app.state.db_session_factory() as db:
        result = await db.execute(select(CameraModel).order_by(CameraModel.id))
        return list(result.scalars().all())


@router.post("", response_model=CameraOut, status_code=status.HTTP_201_CREATED)
async def create_camera(body: CameraIn, request: Request) -> CameraModel:
    async with request.app.state.db_session_factory() as db:
        existing = await db.get(CameraModel, body.id)
        if existing:
            raise HTTPException(status_code=409, detail=f"Camera '{body.id}' already exists")

        row = CameraModel(
            id=body.id,
            name=body.name,
            rtsp_url=body.rtsp_url,
            enabled=body.enabled,
            zones=[z.model_dump() for z in body.zones],
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)

    async with request.app.state.db_session_factory() as db2:
        await _publish_camera_config(request.app.state.redis_client, db2)

    logger.info("camera.created", id=row.id)
    return row


@router.get("/{camera_id}", response_model=CameraOut)
async def get_camera(camera_id: str, request: Request) -> CameraModel:
    async with request.app.state.db_session_factory() as db:
        row = await db.get(CameraModel, camera_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Camera not found")
        return row


@router.put("/{camera_id}", response_model=CameraOut)
async def update_camera(camera_id: str, body: CameraUpdate, request: Request) -> CameraModel:
    async with request.app.state.db_session_factory() as db:
        row = await db.get(CameraModel, camera_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Camera not found")

        if body.name is not None:
            row.name = body.name
        if body.rtsp_url is not None:
            row.rtsp_url = body.rtsp_url
        if body.enabled is not None:
            row.enabled = body.enabled
        if body.zones is not None:
            row.zones = [z.model_dump() for z in body.zones]

        await db.commit()
        await db.refresh(row)

    async with request.app.state.db_session_factory() as db2:
        await _publish_camera_config(request.app.state.redis_client, db2)

    logger.info("camera.updated", id=camera_id)
    return row


@router.delete("/{camera_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_camera(camera_id: str, request: Request) -> None:
    async with request.app.state.db_session_factory() as db:
        row = await db.get(CameraModel, camera_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Camera not found")
        await db.delete(row)
        await db.commit()

    async with request.app.state.db_session_factory() as db2:
        await _publish_camera_config(request.app.state.redis_client, db2)

    logger.info("camera.deleted", id=camera_id)


@router.put("/{camera_id}/zones", response_model=CameraOut)
async def update_zones(
    camera_id: str,
    zones: list[ZoneIn],
    request: Request,
) -> CameraModel:
    async with request.app.state.db_session_factory() as db:
        row = await db.get(CameraModel, camera_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Camera not found")

        row.zones = [z.model_dump() for z in zones]
        await db.commit()
        await db.refresh(row)

    async with request.app.state.db_session_factory() as db2:
        await _publish_camera_config(request.app.state.redis_client, db2)

    logger.info("camera.zones_updated", id=camera_id, zones=len(zones))
    return row
