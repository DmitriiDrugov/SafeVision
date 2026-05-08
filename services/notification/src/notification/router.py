"""
Notification Router — maps channel names to webhook channels.

TODO: Implement NotificationRouter class:

    class NotificationRouter:
        def __init__(self, channels: dict[str, WebhookChannel]) -> None:
            # channels keys: "whatsapp", "email"
            # "dashboard" channel is handled by WebSocket broadcast (not webhook)
            ...

        async def route(self, event: ViolationEvent) -> None:
            '''
            Route event to channels based on event.severity and rule.action.channel.
            Channel == "all": fan-out to all registered channels concurrently
                via asyncio.gather(*[ch.send(event) for ch in channels.values()]).
            Channel == specific: send only to that channel.
            Channel == "dashboard": no-op here; handled by WebSocket broadcast loop.
            '''

        async def broadcast_dashboard(self, event: ViolationEvent) -> None:
            '''
            Push event to all connected WebSocket clients.
            Skips disconnected clients silently.
            '''

Prometheus metrics:
    - notifications_sent_total{channel, severity}: Counter
    - notifications_failed_total{channel, severity}: Counter
"""
