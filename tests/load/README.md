# Load Tests

Sustained-throughput tests verifying the production sizing assumptions.

## Target

- 16 cameras × 5 fps for 1 hour
- Inference p95 < 500ms
- Zero dropped frames over the run
- No memory leaks (RSS stable after warmup)

## Tooling

Use `locust` or a custom `asyncio` driver. RTSP simulation via `mediamtx` with
16 looped clips.

## TODO Test Cases

- `load_16cam_1h.py`: drive 16 simulated streams, scrape Prometheus
  `inference_latency_seconds_bucket`, assert p95 < 500ms.
- `memory_leak_test.py`: run for 4 hours, scrape `process_resident_memory_bytes`,
  assert no monotonic growth after the first 30 minutes.
