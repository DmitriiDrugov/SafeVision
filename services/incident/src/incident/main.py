"""Incident Service — FastAPI application lifecycle.

Startup:
  1. Create async SQLAlchemy engine, run create_all (M3; Alembic for production)
  2. Create MinIO client, ensure bucket exists
  3. Connect to Redis, create consumer group on events.violation
  4. Start background stream consumer task
  5. Start Prometheus metrics

Shutdown:
  1. Cancel background consumer
  2. Close Redis, DB engine
"""
from __future__ import annotations

import asyncio
import logging
import os
import socket
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import AsyncIterator

import redis.asyncio as aioredis
import structlog
from fastapi import FastAPI
from prometheus_client import Counter, start_http_server
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from proto.otel import setup_otel
from proto.violations import ViolationStreamEvent
from schemas.event import ViolationEvent

from .api.routes import ConnectionManager, IncidentOut, router
from .db.models import Base, IncidentModel
from .storage import IncidentStorage

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

_incidents_created = Counter(
    "incident_created_total",
    "Total incidents created from violation events",
    ["severity"],
)

_STREAM_INPUT = "events.violation"
_CONSUMER_GROUP = "incident-cg"
_CONSUMER_NAME = socket.gethostname()
_BLOCK_MS = 200
_BATCH_SIZE = 10


async def _ensure_consumer_group(redis_client: aioredis.Redis) -> None:
    try:
        await redis_client.xgroup_create(
            _STREAM_INPUT, _CONSUMER_GROUP, id="$", mkstream=True
        )
    except aioredis.ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise


def _violation_to_incident(v: ViolationEvent) -> IncidentModel:
    return IncidentModel(
        rule_id=v.rule_name,
        camera_id=v.camera_id,
        zone_id=v.zone_id,
        severity=v.severity.value,
        status="open",
        detection_payload=v.detection_payload.model_dump(),
        detected_at=v.detected_at,
    )


async def _stream_consumer(
    redis_client: aioredis.Redis,
    session_factory: async_sessionmaker[AsyncSession],
    ws_manager: ConnectionManager,
) -> None:
    logger.info("incident.consumer.started", stream=_STREAM_INPUT)
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
                        incident_row = _violation_to_incident(stream_event.payload)

                        async with session_factory() as db:
                            db.add(incident_row)
                            await db.commit()
                            await db.refresh(incident_row)

                        payload = IncidentOut.model_validate(incident_row).model_dump_json()
                        await ws_manager.broadcast(payload)

                        _incidents_created.labels(
                            severity=stream_event.payload.severity.value
                        ).inc()
                        logger.info(
                            "incident.created",
                            id=incident_row.id,
                            rule=stream_event.payload.rule_name,
                            severity=stream_event.payload.severity.value,
                        )
                    except Exception as exc:
                        logger.error(
                            "incident.consumer.error",
                            entry_id=entry_id,
                            error=str(exc),
                            exc_info=True,
                        )
                    finally:
                        await redis_client.xack(
                            _STREAM_INPUT, _CONSUMER_GROUP, entry_id
                        )
        except asyncio.CancelledError:
            logger.info("incident.consumer.stopped")
            break
        except Exception as exc:
            logger.error("incident.consumer.fatal", error=str(exc), exc_info=True)
            await asyncio.sleep(2.0)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    setup_otel("safevision-incident")
    database_url = os.environ.get(
        "DATABASE_URL", "postgresql+asyncpg://safevision:changeme@postgres:5432/safevision"
    )
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")
    metrics_port = int(os.environ.get("METRICS_PORT", "8006"))

    logger.info("incident.starting", database_url=database_url.split("@")[-1])

    engine = create_async_engine(database_url, pool_size=5, max_overflow=10)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    storage = IncidentStorage()
    try:
        await storage.ensure_bucket()
    except Exception as exc:
        logger.warning("incident.minio_unavailable", error=str(exc))

    redis_client = await aioredis.from_url(redis_url, decode_responses=True)
    await _ensure_consumer_group(redis_client)

    ws_manager = ConnectionManager()

    app.state.db_session_factory = session_factory
    app.state.ws_manager = ws_manager
    app.state.storage = storage

    start_http_server(metrics_port)
    logger.info("metrics.started", port=metrics_port)

    consumer_task = asyncio.create_task(
        _stream_consumer(redis_client, session_factory, ws_manager),
        name="incident-consumer",
    )

    logger.info("incident.ready")
    yield

    consumer_task.cancel()
    await asyncio.gather(consumer_task, return_exceptions=True)
    await redis_client.aclose()
    await engine.dispose()
    logger.info("incident.stopped")


app = FastAPI(
    title="SafeVision Incident Service",
    description="Manages safety violation incidents — persistence, lifecycle, and real-time streaming",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(router, prefix="/api/v1")


@app.get("/health", tags=["ops"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
