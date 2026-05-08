# Inference Service

Consumes `FrameEvent` messages from the `frames.raw` Redis Stream, reads pixel data from POSIX shared memory, runs YOLOv8 object detection + ByteTrack multi-object tracking, and publishes `DetectionStreamEvent` results to the `detections.frame` Redis Stream.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection string |
| `MODEL_PATH` | `/models/yolov8n-ppe.onnx` | Path to ONNX model file |
| `DEVICE` | `cuda` | Inference device: `cuda` or `cpu` |
| `INFERENCE_BATCH_SIZE` | `1` | Frames per inference call (batching future option) |
| `METRICS_PORT` | `8002` | Prometheus metrics HTTP port |
| `LOG_LEVEL` | `INFO` | structlog log level |

## Running Locally (CPU, dev)

```bash
pip install -e shared/schemas
pip install -e shared/proto
pip install -e "services/inference[cpu]"   # CPU-only onnxruntime

REDIS_URL=redis://localhost:6379 DEVICE=cpu python -m inference.main
```

## Docker Build (GPU)

```bash
docker build -f services/inference/Dockerfile -t safevision-inference .
docker run --gpus all -e REDIS_URL=redis://redis:6379 safevision-inference
```

## Architecture Notes

- Reads from Redis Stream `frames.raw` using consumer group `inference-cg`.
- After processing, unlinks the POSIX shared memory block (`frame_id` == SHM name).
- ByteTrack state is maintained in memory per camera ID; restarts reset track IDs.
- ONNX Runtime uses `CUDAExecutionProvider` with `CPUExecutionProvider` fallback.

## Required SLIs

- `inference_latency_seconds` histogram (p50, p95, p99) — target p95 < 200ms
- `inference_fps_per_camera` gauge
- `track_count_per_camera` gauge
