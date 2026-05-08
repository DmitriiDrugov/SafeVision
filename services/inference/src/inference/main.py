"""Inference Service — entry point.

Consumes 'frames.raw' Redis Stream, runs YOLOv8+ByteTrack on each frame,
publishes DetectionStreamEvent to 'detections.frame', and prints a summary
to stdout (M1 console output).
"""
from __future__ import annotations

import asyncio
import logging
import os
import signal
import socket
import sys
from datetime import datetime, timezone
from multiprocessing.shared_memory import SharedMemory

import numpy as np
import redis.asyncio as aioredis
import structlog
from prometheus_client import Counter, Gauge, start_http_server

from proto.detections import DetectionStreamEvent
from proto.otel import setup_otel
from proto.frames import FrameEvent
from schemas.detection import DetectionPayload

from .detector import Detector
from .publisher import DetectionPublisher
from .tracker import Tracker
from .zones import ZoneAssigner

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

_frames_processed = Counter(
    "inference_frames_processed_total",
    "Total frames consumed and processed from the frames.raw stream",
    ["camera_id"],
)
_active_tracks = Gauge(
    "inference_active_tracks",
    "Number of currently tracked objects per camera",
    ["camera_id"],
)

_STREAM_INPUT = "frames.raw"
_CONSUMER_GROUP = "inference-cg"
_CONSUMER_NAME = socket.gethostname()
_BLOCK_MS = 100
_BATCH_SIZE = 1


def _read_frame_from_shm(event: FrameEvent) -> np.ndarray:
    shm = SharedMemory(name=event.shm_name, create=False)
    try:
        arr = np.ndarray(
            (event.height, event.width, event.channels),
            dtype=np.uint8,
            buffer=shm.buf,
        ).copy()  # copy before closing SHM
    finally:
        shm.close()
    return arr


def _print_detections(event: FrameEvent, payload: DetectionPayload) -> None:
    ts = datetime.now(tz=timezone.utc).isoformat()
    if not payload.objects:
        print(f"[{ts}] cam={event.camera_id} frame={event.frame_id} — no detections")
        return
    summary = ", ".join(
        f"{o.class_name}#{o.track_id}({o.confidence:.2f})" for o in payload.objects
    )
    print(f"[{ts}] cam={event.camera_id} frame={event.frame_id} — {summary}")


async def _ensure_consumer_group(redis_client: aioredis.Redis) -> None:
    try:
        await redis_client.xgroup_create(
            _STREAM_INPUT, _CONSUMER_GROUP, id="$", mkstream=True
        )
        logger.info("consumer_group.created", group=_CONSUMER_GROUP)
    except aioredis.ResponseError as exc:
        if "BUSYGROUP" in str(exc):
            logger.info("consumer_group.already_exists", group=_CONSUMER_GROUP)
        else:
            raise


async def _main() -> None:
    setup_otel("safevision-inference")
    model_path = os.environ.get("MODEL_PATH", "/models/yolov8n-ppe.onnx")
    device = os.environ.get("DEVICE", "cpu")
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")
    metrics_port = int(os.environ.get("METRICS_PORT", "8002"))

    logger.info(
        "inference.starting",
        model=model_path,
        device=device,
        redis_url=redis_url,
    )

    start_http_server(metrics_port)
    logger.info("metrics.started", port=metrics_port)

    detector = Detector(model_path=model_path, device=device)
    tracker = Tracker()

    redis_client = await aioredis.from_url(redis_url, decode_responses=True)
    await _ensure_consumer_group(redis_client)

    publisher = DetectionPublisher(redis_client)
    zone_assigner = ZoneAssigner(redis_client)

    running = True

    def _handle_sigterm(*_: object) -> None:
        nonlocal running
        logger.info("inference.shutdown_requested")
        running = False

    loop = asyncio.get_running_loop()
    loop.add_signal_handler(signal.SIGTERM, _handle_sigterm)
    loop.add_signal_handler(signal.SIGINT, _handle_sigterm)

    logger.info("inference.consuming", stream=_STREAM_INPUT, group=_CONSUMER_GROUP)

    while running:
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
                shm_name: str | None = None
                try:
                    frame_event = FrameEvent.model_validate_json(fields["data"])
                    shm_name = frame_event.shm_name

                    frame_bgr = await asyncio.get_event_loop().run_in_executor(
                        None, _read_frame_from_shm, frame_event
                    )

                    detections = await asyncio.get_event_loop().run_in_executor(
                        None, detector.detect, frame_bgr
                    )

                    tracked = await asyncio.get_event_loop().run_in_executor(
                        None, tracker.update, detections, frame_bgr, frame_event.camera_id
                    )

                    await zone_assigner.refresh_if_stale()
                    for obj in tracked:
                        cx = (obj.bbox.x1 + obj.bbox.x2) / 2.0 / max(frame_event.width, 1)
                        cy = (obj.bbox.y1 + obj.bbox.y2) / 2.0 / max(frame_event.height, 1)
                        obj.zone_ids = zone_assigner.assign(frame_event.camera_id, cx, cy)

                    payload = DetectionPayload(
                        camera_id=frame_event.camera_id,
                        frame_id=frame_event.frame_id,
                        timestamp=frame_event.timestamp,
                        objects=tracked,
                    )

                    detection_event = DetectionStreamEvent(
                        payload=payload,
                        trace_id=str(entry_id),
                    )

                    await publisher.publish(detection_event, shm_name)
                    shm_name = None  # publisher already unlinked it

                    _frames_processed.labels(camera_id=frame_event.camera_id).inc()
                    _active_tracks.labels(camera_id=frame_event.camera_id).set(
                        len(tracked)
                    )
                    _print_detections(frame_event, payload)

                except Exception as exc:
                    logger.error(
                        "inference.frame_error",
                        entry_id=entry_id,
                        error=str(exc),
                        exc_info=True,
                    )
                    if shm_name:
                        from .publisher import _unlink_shm
                        _unlink_shm(shm_name)
                finally:
                    await redis_client.xack(_STREAM_INPUT, _CONSUMER_GROUP, entry_id)

    await redis_client.aclose()
    logger.info("inference.stopped")


def main() -> None:
    asyncio.run(_main())


if __name__ == "__main__":
    main()
