"""
Incident API Routes.

TODO: Implement the following FastAPI endpoints:

    GET /incidents
        Query params: from_dt, to_dt, severity, status, camera_id, page, page_size (default 50)
        Returns: list[Incident] ordered by detected_at desc
        Uses: async DB session via Depends(get_db)

    GET /incidents/{incident_id}
        Returns: Incident or 404
        Includes presigned MinIO URL for clip_url if evidence exists

    POST /incidents/{incident_id}/acknowledge
        Body: { actor: str, note: str | None }
        Updates status -> acknowledged, sets acknowledged_by, acknowledged_at
        Returns: Incident

    POST /incidents/{incident_id}/resolve
        Body: { actor: str, note: str | None }
        Updates status -> resolved, sets resolved_at
        Returns: Incident

    POST /incidents/{incident_id}/false-positive
        Updates status -> false_positive
        Returns: Incident

    WebSocket /stream/incidents
        On connect: send last 10 open incidents as initial payload
        On new ViolationStreamEvent: broadcast to all connected clients
        On disconnect: remove from connection pool

All mutation endpoints emit an audit log entry (actor, action, timestamp, before/after).
"""
from fastapi import APIRouter

router = APIRouter(prefix="/incidents", tags=["incidents"])

# TODO: implement endpoints
