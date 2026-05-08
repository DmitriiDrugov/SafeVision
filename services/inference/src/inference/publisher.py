"""
Detection Publisher.

Publishes DetectionStreamEvent to the 'detections.frame' Redis Stream
and releases the POSIX shared memory block for the processed frame.

TODO: Implement DetectionPublisher class:

    class DetectionPublisher:
        STREAM_NAME = "detections.frame"
        STREAM_MAXLEN = 10000  # keep last 10k detections for debugging

        def __init__(self, redis_client: redis.asyncio.Redis) -> None:
            ...

        async def publish(
            self,
            event: DetectionStreamEvent,
            frame_id: str,
        ) -> str:
            '''
            1. Serialize event to JSON
            2. XADD STREAM_NAME MAXLEN ~ STREAM_MAXLEN * {data: json_str, trace_id: ...}
            3. Unlink the shared memory block: SharedMemory(name=frame_id).unlink()
            4. Return the Redis stream entry ID
            '''

Prometheus metrics:
    - detections_published_total{camera_id}: Counter
    - publish_latency_seconds: Histogram
"""
