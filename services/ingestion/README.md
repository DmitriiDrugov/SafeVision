# Ingestion Service

Reads RTSP/RTMP video streams, decodes frames at a configurable FPS, writes pixel data to POSIX shared memory, and publishes `FrameEvent` messages to the `frames.raw` Redis Stream.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection string |
| `CAMERA_CONFIG` | — | JSON array of camera objects (id, name, rtsp_url, fps_target, zones) |
| `FPS_TARGET` | `5` | Global default frames-per-second sampling rate |
| `METRICS_PORT` | `8001` | Prometheus metrics HTTP port |
| `LOG_LEVEL` | `INFO` | structlog log level |

## Running Locally

```bash
# Install dependencies (from repo root)
pip install -e shared/schemas
pip install -e shared/proto
pip install -e services/ingestion

# Run (requires a reachable RTSP camera or RTSP simulator)
REDIS_URL=redis://localhost:6379 python -m ingestion.main
```

## Running Tests

```bash
pytest services/ingestion/tests/ -v
```

## Docker Build

```bash
# Build context must be repo root
docker build -f services/ingestion/Dockerfile -t safevision-ingestion .
```

## Architecture Notes

- One `StreamReader` coroutine per camera. Reconnects automatically with exponential backoff.
- Frames are written to `multiprocessing.shared_memory` blocks. The block name equals `frame_id` (UUID).
- The Inference Service is responsible for releasing (unlinking) the shared memory block after processing.
- Redis Stream `frames.raw` has MAXLEN ~1000 (approximate trim) to prevent unbounded growth.
