"""Notification Router — fans out ViolationEvents to the appropriate channels."""
from __future__ import annotations

import asyncio

import structlog
from fastapi import WebSocket, WebSocketDisconnect
from prometheus_client import Counter

from schemas.event import ViolationEvent
from schemas.rule import Channel

from .channels.webhook import WebhookChannel

logger = structlog.get_logger(__name__)

_sent_total = Counter(
    "notifications_sent_total",
    "Total notifications successfully delivered",
    ["channel", "severity"],
)
_failed_total = Counter(
    "notifications_failed_total",
    "Total notifications that failed all delivery attempts",
    ["channel", "severity"],
)


class NotificationRouter:
    def __init__(self, channels: dict[str, WebhookChannel]) -> None:
        self._channels = channels
        self._ws_connections: set[WebSocket] = set()
        self._log = logger.bind(component="router")

    async def route(self, event: ViolationEvent) -> None:
        """Dispatch event to configured channels based on event.channel."""
        ch = event.channel

        if ch == Channel.dashboard:
            await self.broadcast_dashboard(event)
            return

        if ch == Channel.all:
            targets = list(self._channels.items())
        elif ch.value in self._channels:
            targets = [(ch.value, self._channels[ch.value])]
        else:
            self._log.warning(
                "router.channel_not_configured",
                channel=ch.value,
                rule=event.rule_name,
            )
            targets = []

        if targets:
            results = await asyncio.gather(
                *[channel.send(event) for _, channel in targets],
                return_exceptions=True,
            )
            for (name, _), result in zip(targets, results):
                if isinstance(result, Exception) or result is False:
                    _failed_total.labels(
                        channel=name, severity=event.severity.value
                    ).inc()
                else:
                    _sent_total.labels(
                        channel=name, severity=event.severity.value
                    ).inc()

        # Always broadcast to dashboard WebSocket clients regardless of channel
        await self.broadcast_dashboard(event)

    async def broadcast_dashboard(self, event: ViolationEvent) -> None:
        """Push event JSON to all connected WebSocket clients."""
        if not self._ws_connections:
            return
        payload = event.model_dump_json()
        dead: set[WebSocket] = set()
        for ws in self._ws_connections:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(ws)
        self._ws_connections -= dead

    async def connect_ws(self, ws: WebSocket) -> None:
        await ws.accept()
        self._ws_connections.add(ws)
        self._log.debug("ws.connected", total=len(self._ws_connections))

    def disconnect_ws(self, ws: WebSocket) -> None:
        self._ws_connections.discard(ws)
        self._log.debug("ws.disconnected", total=len(self._ws_connections))
