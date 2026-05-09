"""Frame Publisher — writes decoded frames to POSIX shared memory and publishes
FrameEvent references to the 'frames.raw' Redis Stream."""
from __future__ import annotations

import asyncio
import time
from collections import defaultdict
from datetime import datetime
from multiprocessing.shared_memory import SharedMemory

import numpy as np
import redis.asyncio as aioredis
import structlog
from prometheus_client import Gauge, Histogram

from proto.frames import FrameEvent

logger = structlog.get_logger(__name__)

_publish_latency = Histogram(
    "ingestion_publish_latency_seconds",
    "Latency for writing a frame to SHM and Redis",
    ["camera_id"],
    buckets=(0.001, 0.005, 0.01, 0.05, 0.1, 0.5),
)
_shm_blocks_active = Gauge(
    "ingestion_shm_blocks_active",
    "Number of shared memory blocks currently allocated by ingestion",
)


class FramePublisher:
    STREAM_NAME = "frames.raw"
    STREAM_MAXLEN = 1000

    def __init__(
        self,
        redis_client: aioredis.Redis,
        archive: object | None = None,  # FrameArchive | None
    ) -> None:
        self._redis = redis_client
        self._archive = archive
        self._seq: dict[str, int] = defaultdict(int)
        self._log = logger.bind(stream=self.STREAM_NAME)

    async def publish(
        self,
        camera_id: str,
        frame: np.ndarray,
        timestamp: datetime,
    ) -> str:
        """Write frame to SHM, publish FrameEvent to Redis, optionally archive JPEG."""
        t0 = time.perf_counter()

        frame_id = self._next_sequence(camera_id)
        # SHM name must be safe for POSIX: no slashes, short enough
        shm_name = f"sv_{camera_id.replace('-', '_')}_{frame_id}"

        shm = SharedMemory(name=shm_name, create=True, size=int(frame.nbytes))
        try:
            np.copyto(
                np.ndarray(frame.shape, dtype=frame.dtype, buffer=shm.buf),
                frame,
            )
            shm.close()  # close handle; block stays until unlink
        except Exception:
            shm.close()
            shm.unlink()
            raise

        _shm_blocks_active.inc()

        event = FrameEvent(
            camera_id=camera_id,
            frame_id=frame_id,
            timestamp=timestamp,
            shm_name=shm_name,
            shm_offset=0,
            width=frame.shape[1],
            height=frame.shape[0],
            channels=frame.shape[2] if frame.ndim == 3 else 1,
        )

        await self._redis.xadd(
            self.STREAM_NAME,
            {"data": event.model_dump_json()},
            maxlen=self.STREAM_MAXLEN,
            approximate=True,
        )

        # Write JPEG to the frame archive for clip assembly (non-blocking)
        if self._archive is not None:
            ts_ms = int(timestamp.timestamp() * 1000)
            await asyncio.get_event_loop().run_in_executor(
                None, self._archive.write, camera_id, ts_ms, frame
            )

        elapsed = time.perf_counter() - t0
        _publish_latency.labels(camera_id=camera_id).observe(elapsed)
        self._log.debug(
            "frame.published",
            camera_id=camera_id,
            frame_id=frame_id,
            shm_name=shm_name,
            latency_ms=round(elapsed * 1000, 2),
        )
        return shm_name

    def _next_sequence(self, camera_id: str) -> int:
        seq = self._seq[camera_id]
        self._seq[camera_id] += 1
        return seq
