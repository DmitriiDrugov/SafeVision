"""RTSP Stream Reader — decodes frames from an RTSP/RTMP source using PyAV
and hands them to FramePublisher at a fixed sample rate."""
from __future__ import annotations

import asyncio
import threading
import time
from datetime import UTC, datetime

import av
import numpy as np
import structlog
from prometheus_client import Counter, Gauge
from schemas.camera import Camera

from .frame_publisher import FramePublisher

logger = structlog.get_logger(__name__)

_frames_decoded = Counter(
    "ingestion_frames_decoded_total",
    "Total frames decoded from RTSP stream",
    ["camera_id"],
)
_frames_published = Counter(
    "ingestion_frames_published_total",
    "Total frames published to Redis",
    ["camera_id"],
)
_reconnects = Counter(
    "ingestion_stream_reconnects_total",
    "Number of RTSP reconnect attempts",
    ["camera_id"],
)
_active_streams = Gauge(
    "ingestion_active_streams",
    "Number of currently active RTSP decode loops",
)

_RECONNECT_BASE = 1.0
_RECONNECT_MAX = 60.0


class StreamReader:
    def __init__(
        self,
        camera: Camera,
        publisher: FramePublisher,
        fps_target: float = 5.0,
    ) -> None:
        self._camera = camera
        self._publisher = publisher
        self._fps_target = fps_target
        self._running = False
        self._log = logger.bind(camera_id=camera.id, rtsp_url=camera.rtsp_url)

    async def run(self) -> None:
        self._running = True
        _active_streams.inc()
        backoff = _RECONNECT_BASE
        try:
            while self._running:
                try:
                    await self._stream_loop()
                    backoff = _RECONNECT_BASE
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    if not self._running:
                        break
                    _reconnects.labels(camera_id=self._camera.id).inc()
                    self._log.warning(
                        "stream.error_reconnecting",
                        error=str(exc),
                        backoff_s=backoff,
                    )
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 2, _RECONNECT_MAX)
        finally:
            _active_streams.dec()
            self._running = False

    def stop(self) -> None:
        self._running = False

    async def _stream_loop(self) -> None:
        """Bridge blocking PyAV decode to asyncio via a thread + queue."""
        loop = asyncio.get_running_loop()
        # Queue carries (np.ndarray, datetime) tuples; None is the sentinel
        frame_queue: asyncio.Queue[tuple[np.ndarray, datetime] | None] = asyncio.Queue(
            maxsize=10
        )
        stop_event = threading.Event()
        exc_holder: list[Exception] = []

        def _decode_worker() -> None:
            container: av.container.InputContainer | None = None
            try:
                container = self._open_stream()
                self._log.info("stream.opened")
                last_sample_time = 0.0

                for packet in container.demux(video=0):
                    if stop_event.is_set():
                        break
                    for frame in packet.decode():
                        if not isinstance(frame, av.VideoFrame):
                            continue
                        now = time.monotonic()
                        if not self._should_sample(now, last_sample_time):
                            continue
                        last_sample_time = now

                        rgb = frame.to_ndarray(format="rgb24")
                        _frames_decoded.labels(camera_id=self._camera.id).inc()
                        ts = datetime.now(tz=UTC)

                        fut = asyncio.run_coroutine_threadsafe(
                            frame_queue.put((rgb, ts)), loop
                        )
                        # Block the decode thread if consumer falls behind (backpressure)
                        fut.result(timeout=5.0)

            except Exception as exc:
                exc_holder.append(exc)
            finally:
                if container is not None:
                    container.close()
                asyncio.run_coroutine_threadsafe(frame_queue.put(None), loop)

        decode_future = loop.run_in_executor(None, _decode_worker)

        try:
            while True:
                item = await frame_queue.get()
                if item is None:
                    break
                rgb, ts = item
                await self._publisher.publish(
                    camera_id=self._camera.id,
                    frame=rgb,
                    timestamp=ts,
                )
                _frames_published.labels(camera_id=self._camera.id).inc()
        except asyncio.CancelledError:
            stop_event.set()
            raise
        finally:
            stop_event.set()

        await decode_future

        if exc_holder:
            raise exc_holder[0]

    def _open_stream(self) -> av.container.InputContainer:
        options: dict[str, str] = {
            "rtsp_transport": "tcp",
            "stimeout": "5000000",  # 5 s socket timeout (µs)
        }
        return av.open(self._camera.rtsp_url, options=options)

    def _should_sample(self, now: float, last_sample_time: float) -> bool:
        return (now - last_sample_time) >= (1.0 / self._fps_target)
