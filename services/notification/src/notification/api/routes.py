"""
Notification Service API Routes.

TODO: Implement the following endpoints:

    WebSocket /ws/incidents
        Broadcast ViolationStreamEvents to connected Config UI clients.
        Connection manager: dict[WebSocket, set] tracking active connections.
        On connect: accept, add to pool.
        On disconnect: remove from pool (handle WebSocketDisconnect).

    GET /api/v1/channels
        Return list of configured channels with their webhook URL status (configured/missing).

    GET /api/v1/dlq
        Return count and sample of items in the dead-letter queue (Redis key 'notifications.dlq').

    POST /api/v1/dlq/retry
        Trigger immediate retry of all DLQ items. Returns count of retried items.
"""
from fastapi import APIRouter

router = APIRouter()

# TODO: implement WebSocket and REST endpoints
