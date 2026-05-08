"""
Notification Service — FastAPI application.

TODO: Implement application lifecycle:
    - on_startup:
        1. Initialize httpx.AsyncClient (shared connection pool, timeout=WEBHOOK_TIMEOUT_SECONDS)
        2. Build NotificationRouter from env var webhook URLs
        3. Connect to Redis, create consumer group 'notification-cg' on 'events.violation'
        4. Start background task: stream consumer loop
        5. Start background task: DLQ retry loop (retry dead-letter queue every 60s)
    - on_shutdown:
        1. Cancel background tasks
        2. Close httpx client
        3. Close Redis connection

TODO: Mount WebSocket endpoint for real-time dashboard streaming.
"""
from fastapi import FastAPI

app = FastAPI(
    title="SafeVision Notification Service",
    description="Routes violation alerts to n8n webhooks and Config UI WebSocket clients",
    version="0.1.0",
)

# TODO: app.include_router(notification_router)


@app.get("/health", tags=["ops"])
async def health() -> dict[str, str]:
    """Health check for Docker HEALTHCHECK and load balancer probes."""
    return {"status": "ok"}
