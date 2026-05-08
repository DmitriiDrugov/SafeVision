"""Generic webhook delivery channel with exponential backoff and DLQ."""
from __future__ import annotations

import asyncio
import time

import httpx
import structlog
from prometheus_client import Counter, Histogram

from schemas.event import ViolationEvent

logger = structlog.get_logger(__name__)

_delivery_duration = Histogram(
    "notification_delivery_duration_seconds",
    "Time taken to deliver a notification (including retries)",
    ["channel"],
    buckets=(0.05, 0.1, 0.5, 1.0, 5.0, 15.0),
)
_retries_total = Counter(
    "notification_retries_total",
    "Total webhook delivery retries",
    ["channel"],
)
_dlq_writes_total = Counter(
    "notification_dlq_writes_total",
    "Total events written to the dead-letter queue",
    ["channel"],
)

_DLQ_KEY = "notifications.dlq"
_WEBHOOK_TIMEOUT = 10.0  # seconds per attempt


class WebhookChannel:
    MAX_RETRIES = 3
    BACKOFF_BASE = 1.0  # delays: 1s, 2s, 4s

    def __init__(
        self,
        name: str,
        url: str,
        http_client: httpx.AsyncClient,
        redis_client: object,  # redis.asyncio.Redis — avoid import cycle
        headers: dict[str, str] | None = None,
    ) -> None:
        self._name = name
        self._url = url
        self._client = http_client
        self._redis = redis_client
        self._headers = headers or {}
        self._log = logger.bind(channel=name, url=url)

    async def send(self, event: ViolationEvent) -> bool:
        """POST the event to the webhook URL with retry.

        Returns True on success, False after all retries exhausted.
        """
        payload = event.model_dump(mode="json")
        t0 = time.perf_counter()

        for attempt in range(1, self.MAX_RETRIES + 1):
            try:
                response = await self._post(payload)
                if response.is_success:
                    elapsed = time.perf_counter() - t0
                    _delivery_duration.labels(channel=self._name).observe(elapsed)
                    self._log.info(
                        "webhook.delivered",
                        attempt=attempt,
                        status=response.status_code,
                    )
                    return True

                self._log.warning(
                    "webhook.bad_status",
                    attempt=attempt,
                    status=response.status_code,
                )
            except (httpx.TimeoutException, httpx.NetworkError, httpx.HTTPError) as exc:
                self._log.warning(
                    "webhook.network_error", attempt=attempt, error=str(exc)
                )

            if attempt < self.MAX_RETRIES:
                delay = self.BACKOFF_BASE * (2 ** (attempt - 1))
                _retries_total.labels(channel=self._name).inc()
                await asyncio.sleep(delay)

        # All retries exhausted — push to DLQ
        await self._write_to_dlq(event)
        return False

    async def _post(self, payload: dict) -> httpx.Response:
        return await self._client.post(
            self._url,
            json=payload,
            headers=self._headers,
            timeout=_WEBHOOK_TIMEOUT,
        )

    async def _write_to_dlq(self, event: ViolationEvent) -> None:
        _dlq_writes_total.labels(channel=self._name).inc()
        try:
            await self._redis.lpush(  # type: ignore[attr-defined]
                _DLQ_KEY,
                event.model_dump_json(),
            )
            self._log.error(
                "webhook.dlq_write",
                rule=event.rule_name,
                severity=event.severity.value,
            )
        except Exception as exc:
            self._log.error("webhook.dlq_write_failed", error=str(exc))
