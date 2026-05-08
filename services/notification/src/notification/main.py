"""Notification Service — FastAPI application lifecycle.

Startup:
  1. Build WebhookChannel instances from N8N_WHATSAPP_WEBHOOK_URL /
     N8N_EMAIL_WEBHOOK_URL env vars
  2. Create NotificationRouter
  3. Connect to Redis, create consumer group 'notification-cg' on events.violation
  4. Start stream consumer background task
  5. Start DLQ retry background task (every 60 s)

Shutdown:
  1. Cancel background tasks
  2. Close httpx client and Redis connection
"""
from __future__ import annotations

import asyncio
import logging
import os
import socket
import sys
from contextlib import asynccontextmanager
from typing import AsyncIterator

import httpx
import redis.asyncio as aioredis
import structlog
from fastapi import FastAPI
from prometheus_client import Gauge, start_http_server

from proto.otel import setup_otel
from proto.violations import ViolationStreamEvent

from .api.routes import router
from .channels.webhook import WebhookChannel
from .router import NotificationRouter

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer()
        if sys.stderr.isatty()
        else structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)

logger = structlog.get_logger(__name__)

_dlq_depth = Gauge("notification_dlq_depth", "Current number of events in the dead-letter queue")

_STREAM_INPUT = "events.violation"
_CONSUMER_GROUP = "notification-cg"
_CONSUMER_NAME = socket.gethostname()
_BLOCK_MS = 200
_BATCH_SIZE = 10
_DLQ_RETRY_INTERVAL = 60.0


def _build_channels(
    http_client: httpx.AsyncClient,
    redis_client: aioredis.Redis,
) -> dict[str, WebhookChannel]:
    """Build webhook channels from environment variables."""
    channel_env = {
        "whatsapp": "N8N_WHATSAPP_WEBHOOK_URL",
        "email": "N8N_EMAIL_WEBHOOK_URL",
    }
    channels: dict[str, WebhookChannel] = {}
    for name, env_var in channel_env.items():
        url = os.environ.get(env_var, "")
        if url:
            channels[name] = WebhookChannel(
                name=name,
                url=url,
                http_client=http_client,
                redis_client=redis_client,
            )
            logger.info("channel.configured", name=name)
        else:
            logger.warning("channel.not_configured", name=name, env_var=env_var)
    return channels


async def _ensure_consumer_group(redis_client: aioredis.Redis) -> None:
    try:
        await redis_client.xgroup_create(
            _STREAM_INPUT, _CONSUMER_GROUP, id="$", mkstream=True
        )
    except aioredis.ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise


async def _stream_consumer(
    redis_client: aioredis.Redis,
    notif_router: NotificationRouter,
) -> None:
    logger.info("notification.consumer.started", stream=_STREAM_INPUT)
    while True:
        try:
            messages = await redis_client.xreadgroup(
                groupname=_CONSUMER_GROUP,
                consumername=_CONSUMER_NAME,
                streams={_STREAM_INPUT: ">"},
                count=_BATCH_SIZE,
                block=_BLOCK_MS,
            )
            if not messages:
                continue

            for _stream, entries in messages:
                for entry_id, fields in entries:
                    try:
                        stream_event = ViolationStreamEvent.model_validate_json(
                            fields["data"]
                        )
                        await notif_router.route(stream_event.payload)
                    except Exception as exc:
                        logger.error(
                            "notification.consumer.error",
                            entry_id=entry_id,
                            error=str(exc),
                            exc_info=True,
                        )
                    finally:
                        await redis_client.xack(
                            _STREAM_INPUT, _CONSUMER_GROUP, entry_id
                        )
        except asyncio.CancelledError:
            logger.info("notification.consumer.stopped")
            break
        except Exception as exc:
            logger.error("notification.consumer.fatal", error=str(exc))
            await asyncio.sleep(2.0)


async def _dlq_retry_loop(
    redis_client: aioredis.Redis,
    notif_router: NotificationRouter,
) -> None:
    """Periodically drain and retry the dead-letter queue."""
    from schemas.event import ViolationEvent

    logger.info("dlq.retry_loop.started", interval_s=_DLQ_RETRY_INTERVAL)
    while True:
        try:
            await asyncio.sleep(_DLQ_RETRY_INTERVAL)
            count = await redis_client.llen("notifications.dlq")
            _dlq_depth.set(count)
            if count == 0:
                continue
            logger.info("dlq.retrying", count=count)
            retried = 0
            for _ in range(count):
                item = await redis_client.rpop("notifications.dlq")
                if item is None:
                    break
                try:
                    event = ViolationEvent.model_validate_json(item)
                    await notif_router.route(event)
                    retried += 1
                except Exception as exc:
                    logger.error("dlq.retry_item_failed", error=str(exc))
                    await redis_client.rpush("notifications.dlq", item)
            logger.info("dlq.retry_complete", retried=retried)
        except asyncio.CancelledError:
            logger.info("dlq.retry_loop.stopped")
            break
        except Exception as exc:
            logger.error("dlq.retry_loop.error", error=str(exc))


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    setup_otel("safevision-notification")
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")
    metrics_port = int(os.environ.get("METRICS_PORT", "8007"))

    logger.info("notification.starting", redis_url=redis_url)

    http_client = httpx.AsyncClient(timeout=15.0)
    redis_client = await aioredis.from_url(redis_url, decode_responses=True)

    channels = _build_channels(http_client, redis_client)
    notif_router = NotificationRouter(channels)

    await _ensure_consumer_group(redis_client)

    app.state.notification_router = notif_router
    app.state.redis_client = redis_client

    start_http_server(metrics_port)
    logger.info("metrics.started", port=metrics_port)

    consumer_task = asyncio.create_task(
        _stream_consumer(redis_client, notif_router), name="notification-consumer"
    )
    dlq_task = asyncio.create_task(
        _dlq_retry_loop(redis_client, notif_router), name="notification-dlq-retry"
    )

    logger.info("notification.ready", channels=list(channels.keys()))
    yield

    consumer_task.cancel()
    dlq_task.cancel()
    await asyncio.gather(consumer_task, dlq_task, return_exceptions=True)
    await http_client.aclose()
    await redis_client.aclose()
    logger.info("notification.stopped")


app = FastAPI(
    title="SafeVision Notification Service",
    description="Routes violation alerts to n8n webhooks and Config UI WebSocket clients",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(router)


@app.get("/health", tags=["ops"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
