"""Tests for NotificationRouter and WebhookChannel."""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import httpx
import pytest
import respx

from notification.channels.webhook import WebhookChannel, _DLQ_KEY
from notification.router import NotificationRouter
from schemas.detection import BoundingBox, DetectionPayload, TrackedObject
from schemas.event import ViolationEvent
from schemas.rule import Channel, Severity


# ── factories ──────────────────────────────────────────────────────────────

def _event(channel: Channel = Channel.whatsapp) -> ViolationEvent:
    return ViolationEvent(
        event_id=uuid4(),
        rule_name="test_rule",
        camera_id="cam01",
        zone_id="zone_a",
        severity=Severity.high,
        channel=channel,
        detected_at=datetime.now(tz=timezone.utc),
        detection_payload=DetectionPayload(
            camera_id="cam01",
            frame_id=1,
            timestamp=datetime.now(tz=timezone.utc),
            objects=[],
        ),
        trace_id="test-trace",
    )


def _make_channel(name: str, http_client: httpx.AsyncClient, redis_mock: MagicMock) -> WebhookChannel:
    return WebhookChannel(
        name=name,
        url=f"https://n8n.example.com/webhook/{name}",
        http_client=http_client,
        redis_client=redis_mock,
    )


# ── router tests ───────────────────────────────────────────────────────────

class TestNotificationRouter:
    @pytest.mark.asyncio()
    async def test_route_to_specific_channel(self) -> None:
        """whatsapp-targeted event calls whatsapp send only."""
        wa_channel = AsyncMock()
        wa_channel.send = AsyncMock(return_value=True)
        email_channel = AsyncMock()
        email_channel.send = AsyncMock(return_value=True)

        router = NotificationRouter({"whatsapp": wa_channel, "email": email_channel})
        await router.route(_event(channel=Channel.whatsapp))

        wa_channel.send.assert_called_once()
        email_channel.send.assert_not_called()

    @pytest.mark.asyncio()
    async def test_route_to_all_channels(self) -> None:
        """channel=all fans out to every registered channel concurrently."""
        wa_channel = AsyncMock()
        wa_channel.send = AsyncMock(return_value=True)
        email_channel = AsyncMock()
        email_channel.send = AsyncMock(return_value=True)

        router = NotificationRouter({"whatsapp": wa_channel, "email": email_channel})
        await router.route(_event(channel=Channel.all))

        wa_channel.send.assert_called_once()
        email_channel.send.assert_called_once()

    @pytest.mark.asyncio()
    async def test_dashboard_only_skips_webhooks(self) -> None:
        """channel=dashboard does NOT invoke webhook channels."""
        wa_channel = AsyncMock()
        wa_channel.send = AsyncMock(return_value=True)

        router = NotificationRouter({"whatsapp": wa_channel})
        await router.route(_event(channel=Channel.dashboard))

        wa_channel.send.assert_not_called()

    @pytest.mark.asyncio()
    async def test_unconfigured_channel_is_a_noop(self) -> None:
        """Routing to a channel not in the dict logs warning and moves on."""
        router = NotificationRouter({})  # no email configured
        # Should not raise
        await router.route(_event(channel=Channel.email))


# ── webhook channel tests ──────────────────────────────────────────────────

class TestWebhookChannel:
    @pytest.mark.asyncio()
    @respx.mock
    async def test_delivers_on_first_attempt(self) -> None:
        url = "https://n8n.example.com/webhook/wa"
        respx.post(url).mock(return_value=httpx.Response(200))
        redis_mock = AsyncMock()

        async with httpx.AsyncClient() as client:
            ch = WebhookChannel("whatsapp", url, client, redis_mock)
            result = await ch.send(_event())

        assert result is True
        redis_mock.lpush.assert_not_called()

    @pytest.mark.asyncio()
    @respx.mock
    async def test_retries_on_5xx_then_succeeds(self) -> None:
        url = "https://n8n.example.com/webhook/wa"
        respx.post(url).mock(
            side_effect=[
                httpx.Response(500),
                httpx.Response(500),
                httpx.Response(200),
            ]
        )
        redis_mock = AsyncMock()

        with patch("notification.channels.webhook.asyncio.sleep", new_callable=AsyncMock):
            async with httpx.AsyncClient() as client:
                ch = WebhookChannel("whatsapp", url, client, redis_mock)
                result = await ch.send(_event())

        assert result is True
        redis_mock.lpush.assert_not_called()

    @pytest.mark.asyncio()
    @respx.mock
    async def test_writes_to_dlq_after_max_retries(self) -> None:
        url = "https://n8n.example.com/webhook/wa"
        respx.post(url).mock(return_value=httpx.Response(500))
        redis_mock = AsyncMock()

        with patch("notification.channels.webhook.asyncio.sleep", new_callable=AsyncMock):
            async with httpx.AsyncClient() as client:
                ch = WebhookChannel("whatsapp", url, client, redis_mock)
                result = await ch.send(_event())

        assert result is False
        redis_mock.lpush.assert_called_once()
        args = redis_mock.lpush.call_args[0]
        assert args[0] == _DLQ_KEY

    @pytest.mark.asyncio()
    @respx.mock
    async def test_timeout_triggers_retry_and_dlq(self) -> None:
        url = "https://n8n.example.com/webhook/wa"
        respx.post(url).mock(side_effect=httpx.TimeoutException("timeout"))
        redis_mock = AsyncMock()

        with patch("notification.channels.webhook.asyncio.sleep", new_callable=AsyncMock):
            async with httpx.AsyncClient() as client:
                ch = WebhookChannel("whatsapp", url, client, redis_mock)
                result = await ch.send(_event())

        assert result is False
        redis_mock.lpush.assert_called_once()

    @pytest.mark.asyncio()
    @respx.mock
    async def test_backoff_delays_increase_exponentially(self) -> None:
        url = "https://n8n.example.com/webhook/wa"
        respx.post(url).mock(return_value=httpx.Response(500))
        redis_mock = AsyncMock()
        sleep_calls: list[float] = []

        async def _fake_sleep(delay: float) -> None:
            sleep_calls.append(delay)

        with patch("notification.channels.webhook.asyncio.sleep", side_effect=_fake_sleep):
            async with httpx.AsyncClient() as client:
                ch = WebhookChannel("whatsapp", url, client, redis_mock)
                await ch.send(_event())

        assert sleep_calls == [1.0, 2.0]  # 1s after attempt 1, 2s after attempt 2
