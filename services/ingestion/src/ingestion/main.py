"""Ingestion Service — entry point.

Reads CAMERA_CONFIG (JSON array of Camera objects) from the environment,
opens an RTSP stream for each camera, and publishes decoded frames to the
'frames.raw' Redis Stream via POSIX shared memory.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import sys

import redis.asyncio as aioredis
import structlog
from prometheus_client import start_http_server

from proto.otel import setup_otel
from schemas.camera import Camera

from .frame_publisher import FramePublisher
from .stream_reader import StreamReader

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer() if sys.stderr.isatty() else structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)

logger = structlog.get_logger(__name__)


def _load_cameras() -> list[Camera]:
    raw = os.environ.get("CAMERA_CONFIG", "")
    if not raw:
        raise RuntimeError("CAMERA_CONFIG environment variable is not set")
    data = json.loads(raw)
    return [Camera.model_validate(c) for c in data]


async def _main() -> None:
    setup_otel("safevision-ingestion")
    cameras = _load_cameras()
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")
    metrics_port = int(os.environ.get("METRICS_PORT", "8001"))
    fps_target = float(os.environ.get("FPS_TARGET", "5.0"))

    logger.info("ingestion.starting", cameras=[c.id for c in cameras], redis_url=redis_url)

    start_http_server(metrics_port)
    logger.info("metrics.started", port=metrics_port)

    redis_client = await aioredis.from_url(redis_url, decode_responses=True)

    publisher = FramePublisher(redis_client)
    readers = [StreamReader(camera=cam, publisher=publisher, fps_target=fps_target) for cam in cameras]

    tasks = [asyncio.create_task(r.run(), name=f"reader-{r._camera.id}") for r in readers]

    loop = asyncio.get_running_loop()

    shutdown_event = asyncio.Event()

    def _handle_sigterm(*_: object) -> None:
        logger.info("ingestion.shutdown_requested")
        shutdown_event.set()

    loop.add_signal_handler(signal.SIGTERM, _handle_sigterm)
    loop.add_signal_handler(signal.SIGINT, _handle_sigterm)

    await shutdown_event.wait()

    logger.info("ingestion.stopping_readers")
    for r in readers:
        r.stop()
    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)

    await redis_client.aclose()
    logger.info("ingestion.stopped")


def main() -> None:
    asyncio.run(_main())


if __name__ == "__main__":
    main()
