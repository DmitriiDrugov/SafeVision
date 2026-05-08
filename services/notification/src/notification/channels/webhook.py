"""
Generic Webhook Channel.

TODO: Implement WebhookChannel class:

    class WebhookChannel:
        MAX_RETRIES = 3
        BACKOFF_BASE_SECONDS = 1.0  # 1s, 2s, 4s

        def __init__(
            self,
            url: str,
            http_client: httpx.AsyncClient,
            headers: dict[str, str] | None = None,
        ) -> None:
            ...

        async def send(self, event: ViolationEvent) -> bool:
            '''
            POST event.model_dump() as JSON to self.url.
            Retry up to MAX_RETRIES on non-2xx or network errors.
            Returns True on success, False after all retries exhausted.
            On final failure: write raw event JSON to Redis 'notifications.dlq' list (LPUSH).
            '''

        async def _post(self, payload: dict) -> httpx.Response:
            '''Single POST attempt with timeout=WEBHOOK_TIMEOUT_SECONDS.'''

Prometheus metrics:
    - notification_delivery_duration_seconds{channel}: Histogram
    - notification_retries_total{channel}: Counter
    - notification_dlq_writes_total{channel}: Counter
"""
