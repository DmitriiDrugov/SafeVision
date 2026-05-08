"""Notification Service API — WebSocket broadcast + DLQ management."""
from __future__ import annotations

from typing import Any

import structlog
from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect

logger = structlog.get_logger(__name__)

router = APIRouter()


# ── WebSocket ─────────────────────────────────────────────────────────────

@router.websocket("/ws/incidents")
async def ws_incidents(websocket: WebSocket, request: Request) -> None:
    """Real-time ViolationEvent feed for the Config UI dashboard."""
    notif_router = request.app.state.notification_router
    await notif_router.connect_ws(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep connection alive
    except WebSocketDisconnect:
        notif_router.disconnect_ws(websocket)


# ── REST ──────────────────────────────────────────────────────────────────

@router.get("/api/v1/channels")
async def list_channels(request: Request) -> list[dict[str, str]]:
    """Return configured channels and their URLs (masked)."""
    notif_router = request.app.state.notification_router
    return [
        {"name": name, "url": _mask_url(ch._url)}
        for name, ch in notif_router._channels.items()
    ]


@router.get("/api/v1/dlq")
async def get_dlq(request: Request) -> dict[str, Any]:
    """Return DLQ depth and up to 10 sample items."""
    redis_client = request.app.state.redis_client
    count: int = await redis_client.llen("notifications.dlq")
    sample = await redis_client.lrange("notifications.dlq", 0, 9)
    return {"count": count, "sample": sample}


@router.post("/api/v1/dlq/retry")
async def retry_dlq(request: Request) -> dict[str, int]:
    """Pop all DLQ items and re-route them immediately."""
    redis_client = request.app.state.redis_client
    notif_router = request.app.state.notification_router

    from schemas.event import ViolationEvent

    retried = 0
    while True:
        item = await redis_client.rpop("notifications.dlq")
        if item is None:
            break
        try:
            event = ViolationEvent.model_validate_json(item)
            await notif_router.route(event)
            retried += 1
        except Exception as exc:
            logger.error("dlq.retry_failed", error=str(exc))
            # Re-push failed item back to DLQ tail
            await redis_client.rpush("notifications.dlq", item)
            break

    return {"retried": retried}


def _mask_url(url: str) -> str:
    """Return URL with any query-string tokens redacted."""
    if "?" in url:
        base, _ = url.split("?", 1)
        return base + "?***"
    return url
