"""
Ingestion Service entry point.

TODO: Implement the following startup sequence:
    1. Parse CAMERA_CONFIG env var (JSON array of camera objects)
    2. Initialize Redis connection (redis.asyncio.from_url)
    3. Instantiate FramePublisher with the Redis client
    4. For each camera, spawn a StreamReader coroutine (asyncio.gather)
    5. Start Prometheus metrics HTTP server on METRICS_PORT
    6. Initialize OpenTelemetry tracer with OTLP exporter
    7. Handle SIGTERM for graceful shutdown:
       - Stop all StreamReader coroutines
       - Flush remaining frames
       - Close Redis connection
       - Unlink any open shared memory blocks

Architecture note:
    Video frames are large (1080p = ~6 MB). They are written to POSIX
    shared memory by FramePublisher and referenced by UUID in the Redis
    Stream event. The Inference Service reads the raw pixels from SHM,
    then unlinks the block. This avoids copying MB-scale data through Redis.
"""
