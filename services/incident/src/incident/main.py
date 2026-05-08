"""
Incident Service — FastAPI application.

TODO: Implement application lifecycle:
    - on_startup:
        1. Create SQLAlchemy async engine from DATABASE_URL
        2. Initialize MinIO client (storage.py)
        3. Connect to Redis, create consumer group 'incident-cg' on 'events.violation'
        4. Start background task: stream consumer (XREADGROUP loop)
        5. Start background task: WebSocket broadcast loop
    - on_shutdown:
        1. Cancel background tasks
        2. XACK pending Redis messages
        3. Close DB engine, Redis, MinIO connections

TODO: Mount the incidents router from api/routes.py.
TODO: Add Prometheus instrumentator middleware (prometheus-fastapi-instrumentator).
"""
from fastapi import FastAPI

from shared.schemas.incident import Incident  # noqa: F401 — referenced in TODO routes

app = FastAPI(
    title="SafeVision Incident Service",
    description="Manages safety violation incidents — persistence, lifecycle, and real-time streaming",
    version="0.1.0",
)

# TODO: app.include_router(incidents_router, prefix="/api/v1")


@app.get("/health", tags=["ops"])
async def health() -> dict[str, str]:
    """Health check for Docker HEALTHCHECK and load balancer probes."""
    return {"status": "ok"}
