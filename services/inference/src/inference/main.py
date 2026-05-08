"""
Inference Service entry point.

TODO: Implement startup sequence:
    1. Initialize ONNX Runtime session via Detector (MODEL_PATH, DEVICE env vars)
    2. Initialize ByteTrack Tracker
    3. Connect to Redis, create consumer group 'inference-cg' on 'frames.raw'
    4. Instantiate DetectionPublisher
    5. Start Prometheus metrics server on METRICS_PORT
    6. Initialize OpenTelemetry tracer
    7. Main loop:
       a. XREADGROUP from 'frames.raw' with block=100ms, count=1
       b. Read frame pixels from POSIX shared memory (frame_id == shm name)
       c. Run Detector.detect(frame) -> list[TrackedObject]
       d. Run Tracker.update(detections, frame) -> list[TrackedObject] with track_ids
       e. Publish DetectionStreamEvent via DetectionPublisher
       f. XACK the processed message
       g. Unlink the shared memory block
    8. Graceful shutdown: XACK pending messages, close Redis, close SHM

Note on consumer groups:
    Use XREADGROUP with GROUP inference-cg CONSUMER <hostname>.
    Create the group with XGROUP CREATE frames.raw inference-cg $ MKSTREAM
    (use $ to start from latest; use 0 to replay from beginning in testing).
"""
