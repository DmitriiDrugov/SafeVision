"""
Frame Publisher.

Writes decoded frames to POSIX shared memory and publishes FrameEvent
references to the 'frames.raw' Redis Stream.

TODO: Implement FramePublisher class:

    class FramePublisher:
        STREAM_NAME = "frames.raw"
        STREAM_MAXLEN = 1000  # approximate trim (~)

        def __init__(self, redis_client: redis.asyncio.Redis) -> None:
            ...

        async def publish(
            self,
            camera_id: str,
            frame: numpy.ndarray,
            timestamp: datetime,
        ) -> str:
            '''
            1. Generate frame_id = str(uuid4())
            2. Allocate multiprocessing.shared_memory.SharedMemory(
                   name=frame_id, create=True, size=frame.nbytes)
            3. Copy frame bytes into SHM block
            4. Construct FrameEvent(camera_id, frame_id, shm_key=frame_id,
                   width, height, channels, timestamp, sequence_number)
            5. XADD STREAM_NAME MAXLEN ~ STREAM_MAXLEN * frame_event.model_dump_json()
            6. Return frame_id
            '''

        def _next_sequence(self, camera_id: str) -> int:
            '''Monotonic per-camera frame counter (in-memory).'''

Prometheus metrics:
    - publish_latency_seconds{camera_id}: Histogram (buckets: 1ms, 5ms, 10ms, 50ms)
    - shm_blocks_active: Gauge (incremented on alloc, decremented when Inference acks)
"""
