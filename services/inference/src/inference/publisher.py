"""Detection Publisher — publishes DetectionStreamEvent to Redis and releases
the POSIX shared memory block used by the processed frame."""
from __future__ import annotations

import time
from multiprocessing.shared_memory import SharedMemory

import redis.asyncio as aioredis
import structlog
from prometheus_client import Counter, Histogram

from proto.detections import DetectionStreamEvent

logger = structlog.get_logger(__name__)

_published_total = Counter(
    "inference_detections_published_total",
    "Total DetectionStreamEvents published to Redis",
    ["camera_id"],
)
_publish_latency = Histogram(
    "inference_publish_latency_seconds",
    "Latency for serialising and publishing a DetectionStreamEvent",
    buckets=(0.001, 0.005, 0.01, 0.05, 0.1),
)


class DetectionPublisher:
    STREAM_NAME = "detections.frame"
    STREAM_MAXLEN = 10_000

    def __init__(self, redis_client: aioredis.Redis) -> None:
        self._redis = redis_client
        self._log = logger.bind(stream=self.STREAM_NAME)

    async def publish(self, event: DetectionStreamEvent, shm_name: str) -> str:
        """Publish event to Redis then release the shared memory block.

        Returns the Redis stream entry ID.
        """
        t0 = time.perf_counter()

        entry_id: str = await self._redis.xadd(
            self.STREAM_NAME,
            {"data": event.model_dump_json()},
            maxlen=self.STREAM_MAXLEN,
            approximate=True,
        )

        _unlink_shm(shm_name)

        elapsed = time.perf_counter() - t0
        _publish_latency.observe(elapsed)
        _published_total.labels(camera_id=event.payload.camera_id).inc()

        self._log.debug(
            "detection.published",
            camera_id=event.payload.camera_id,
            objects=len(event.payload.objects),
            entry_id=entry_id,
        )
        return entry_id


def _unlink_shm(shm_name: str) -> None:
    try:
        shm = SharedMemory(name=shm_name, create=False)
        shm.close()
        shm.unlink()
    except FileNotFoundError:
        pass  # already unlinked
    except Exception as exc:
        logger.warning("shm.unlink_failed", name=shm_name, error=str(exc))
