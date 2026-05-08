# SafeVision Architecture

The high-level data flow and architecture diagram lives in the [project README](../README.md). This document covers details that don't fit there.

## Service Responsibilities

| Service | Responsibility | Stateful? |
|---|---|---|
| Ingestion | RTSP decode, FPS sampling, frame publish to shared memory + Redis Stream | No (config-driven) |
| Inference | YOLOv8 detection + ByteTrack tracking | Yes (in-memory tracker state per camera) |
| Rule Engine | Evaluate YAML rules against detections | Yes (in-memory duration counters; non-persistent) |
| Incident | Persist incidents, store clips, REST + WebSocket API | Yes (Postgres + MinIO) |
| Notification | Webhook routing, dead-letter retry | Yes (Redis DLQ) |
| Web App | UI + LLM rule builder proxy | No |

## Stream Topics

| Stream | Producer | Consumer(s) | Schema |
|---|---|---|---|
| `frames.raw` | Ingestion | Inference | `safevision-proto.FrameEvent` |
| `detections.frame` | Inference | Rule Engine | `safevision-proto.DetectionStreamEvent` |
| `events.violation` | Rule Engine | Incident, Notification | `safevision-proto.ViolationStreamEvent` |
| `notifications.dlq` | Notification | Notification (retry loop) | Raw ViolationEvent JSON |

All streams use Redis consumer groups for at-least-once delivery semantics. MAXLEN trim policies prevent unbounded growth — see service READMEs.

## Frame Transport

Video frames are large (~6 MB at 1080p). Sending them through Redis would saturate the broker. Instead:

1. Ingestion writes raw frame bytes to a POSIX shared-memory block named after a UUID.
2. Ingestion publishes a `FrameEvent` referencing the SHM block name.
3. Inference reads the bytes from SHM, runs detection, then unlinks the SHM block.

This is safe because Ingestion and Inference run on the same host (single-plant deployment).

## Data Sovereignty

Video never leaves the plant. Only:
- Incident metadata (text, timestamps)
- Short evidence clips (10s pre + 10s post — face-blurred when configured)

…travel to cloud (or off-host MinIO). RTSP URLs are encrypted at rest.

## Trace Propagation

OpenTelemetry trace IDs are propagated through Redis Stream message headers. Each service extracts the parent context, creates a child span, and re-injects on emit. End-to-end traces from frame ingest → notification webhook are visible in the OTLP backend.

## TODO

- Sequence diagram: detection → notification (happy path)
- Sequence diagram: rule hot-reload
- Sequence diagram: incident acknowledgement
- Backpressure handling: what happens when Inference falls behind Ingestion
- Multi-plant deployment topology diagram
