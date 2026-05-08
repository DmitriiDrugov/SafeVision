"""Ingestion Service — entry point.

Reads camera config from the Redis key `safevision:cameras` (JSON array of
Camera objects, maintained by the Incident Service REST API). Falls back to
the `CAMERA_CONFIG` environment variable on first start when the key is not
yet populated, and seeds the Redis key from it so subsequent restarts are
consistent.

A background reconciler polls the Redis key every `CAMERA_POLL_INTERVAL_SECS`
seconds (default 30) and starts/stops/restarts StreamReader tasks when cameras
are added, removed, or have their RTSP URL changed.
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

from .frame_archive import FrameArchive
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

_CAMERA_CONFIG_KEY = "safevision:cameras"
_CAMERA_POLL_INTERVAL = int(os.environ.get("CAMERA_POLL_INTERVAL_SECS", "30"))


async def _load_cameras_from_redis(redis_client: aioredis.Redis) -> list[Camera] | None:
    """Return the camera list from Redis, or None if the key doesn't exist."""
    raw = await redis_client.get(_CAMERA_CONFIG_KEY)
    if not raw:
        return None
    data = json.loads(raw)
    return [Camera.model_validate(c) for c in data]


def _load_cameras_from_env() -> list[Camera]:
    """Parse CAMERA_CONFIG env var into Camera objects."""
    raw = os.environ.get("CAMERA_CONFIG", "[]")
    data = json.loads(raw)
    return [Camera.model_validate(c) for c in data]


async def _seed_redis_from_env(redis_client: aioredis.Redis, cameras: list[Camera]) -> None:
    """Write initial camera list to Redis so API and reconciler see the same state."""
    payload = [c.model_dump(mode="json") for c in cameras]
    await redis_client.set(_CAMERA_CONFIG_KEY, json.dumps(payload))
    logger.info("ingestion.cameras_seeded_to_redis", count=len(cameras))


class CameraManager:
    """Manages a pool of StreamReader asyncio Tasks, reconciling against Redis."""

    def __init__(
        self,
        publisher: FramePublisher,
        fps_target: float,
    ) -> None:
        self._publisher = publisher
        self._fps_target = fps_target
        # Maps camera_id → (Camera, Task) for currently running readers
        self._running: dict[str, tuple[Camera, asyncio.Task[None]]] = {}

    def _start_reader(self, camera: Camera) -> asyncio.Task[None]:
        reader = StreamReader(camera=camera, publisher=self._publisher, fps_target=self._fps_target)
        task = asyncio.create_task(reader.run(), name=f"reader-{camera.id}")
        logger.info("ingestion.reader_started", camera_id=camera.id, rtsp_url=camera.rtsp_url)
        return task

    async def _stop_reader(self, camera_id: str) -> None:
        if camera_id not in self._running:
            return
        _cam, task = self._running.pop(camera_id)
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass
        logger.info("ingestion.reader_stopped", camera_id=camera_id)

    async def reconcile(self, cameras: list[Camera]) -> None:
        """Diff the desired camera list against running tasks and adjust."""
        desired = {c.id: c for c in cameras if c.enabled}
        running_ids = set(self._running)
        desired_ids = set(desired)

        # Stop readers for removed or disabled cameras
        for cam_id in running_ids - desired_ids:
            await self._stop_reader(cam_id)

        # Start readers for new cameras; restart if RTSP URL changed
        for cam_id, cam in desired.items():
            if cam_id in self._running:
                current_cam, task = self._running[cam_id]
                if task.done():
                    # Task died unexpectedly — restart it
                    logger.warning("ingestion.reader_died_restarting", camera_id=cam_id)
                    self._running.pop(cam_id)
                elif current_cam.rtsp_url != cam.rtsp_url:
                    logger.info(
                        "ingestion.reader_rtsp_changed",
                        camera_id=cam_id,
                        old=current_cam.rtsp_url,
                        new=cam.rtsp_url,
                    )
                    await self._stop_reader(cam_id)
                else:
                    continue  # already running, nothing changed

            task = self._start_reader(cam)
            self._running[cam_id] = (cam, task)

    async def stop_all(self) -> None:
        for cam_id in list(self._running):
            await self._stop_reader(cam_id)

    @property
    def running_camera_ids(self) -> list[str]:
        return list(self._running)


async def _reconcile_loop(
    redis_client: aioredis.Redis,
    manager: CameraManager,
    shutdown_event: asyncio.Event,
) -> None:
    """Poll `safevision:cameras` and reconcile StreamReader tasks every 30 s."""
    while not shutdown_event.is_set():
        try:
            cameras = await _load_cameras_from_redis(redis_client)
            if cameras is not None:
                await manager.reconcile(cameras)
        except Exception as exc:
            logger.warning("ingestion.reconcile_error", error=str(exc))

        try:
            await asyncio.wait_for(shutdown_event.wait(), timeout=_CAMERA_POLL_INTERVAL)
        except asyncio.TimeoutError:
            pass  # normal — keep polling


async def _main() -> None:
    setup_otel("safevision-ingestion")
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")
    metrics_port = int(os.environ.get("METRICS_PORT", "8001"))
    fps_target = float(os.environ.get("FPS_TARGET", "5.0"))

    logger.info("ingestion.starting", redis_url=redis_url)

    start_http_server(metrics_port)
    logger.info("metrics.started", port=metrics_port)

    redis_client = await aioredis.from_url(redis_url, decode_responses=True)

    # Bootstrap: use Redis key if present, otherwise seed from env var
    cameras = await _load_cameras_from_redis(redis_client)
    if cameras is None:
        cameras = _load_cameras_from_env()
        if cameras:
            await _seed_redis_from_env(redis_client, cameras)
        else:
            logger.warning(
                "ingestion.no_cameras",
                detail="CAMERA_CONFIG is empty and safevision:cameras key not set; "
                "add cameras via the API to start streaming.",
            )
            cameras = []

    logger.info("ingestion.initial_cameras", camera_ids=[c.id for c in cameras])

    archive = FrameArchive()
    publisher = FramePublisher(redis_client, archive=archive)
    manager = CameraManager(publisher=publisher, fps_target=fps_target)

    # Start initial readers
    await manager.reconcile(cameras)

    cleanup_task = asyncio.create_task(archive.run_cleanup(), name="frame-archive-cleanup")

    loop = asyncio.get_running_loop()
    shutdown_event = asyncio.Event()

    def _handle_sigterm(*_: object) -> None:
        logger.info("ingestion.shutdown_requested")
        shutdown_event.set()

    loop.add_signal_handler(signal.SIGTERM, _handle_sigterm)
    loop.add_signal_handler(signal.SIGINT, _handle_sigterm)

    reconcile_task = asyncio.create_task(
        _reconcile_loop(redis_client, manager, shutdown_event),
        name="camera-reconciler",
    )

    await shutdown_event.wait()

    logger.info("ingestion.stopping")
    reconcile_task.cancel()
    await asyncio.gather(reconcile_task, return_exceptions=True)

    await manager.stop_all()
    cleanup_task.cancel()
    await asyncio.gather(cleanup_task, return_exceptions=True)

    await redis_client.aclose()
    logger.info("ingestion.stopped")


def main() -> None:
    asyncio.run(_main())


if __name__ == "__main__":
    main()
