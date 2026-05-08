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

## Sequence Diagrams

### Happy path: frame → violation → notification

```
Ingestion          Inference          Rule Engine        Incident           Notification
    |                  |                   |                  |                   |
    | XADD frames.raw  |                   |                  |                   |
    |  (SHM ref)       |                   |                  |                   |
    |----------------->|                   |                  |                   |
    |                  | read SHM          |                  |                   |
    |                  | detect+track      |                  |                   |
    |                  | XADD detections   |                  |                   |
    |                  |------------------>|                  |                   |
    |                  | XACK frames.raw   |                  |                   |
    |                  |                   | evaluate rules   |                   |
    |                  |                   | (match found)    |                   |
    |                  |                   | XADD events.     |                   |
    |                  |                   |  violation       |                   |
    |                  |                   |----------------->|                   |
    |                  |                   |                  |----------------->|
    |                  |                   | XACK detections  | persist to DB    | POST n8n
    |                  |                   |                  | broadcast WS     | webhook
    |                  |                   |                  | XACK violation   |
```

### Rule hot-reload

```
Filesystem        Watchdog (OS thread)    RuleLoader          RuleEvaluator consumer
    |                    |                    |                       |
    | write *.yaml       |                    |                       |
    |-------------------> |                   |                       |
    |                    | inotify event      |                       |
    |                    | on_any_event()     |                       |
    |                    |------------------->|                       |
    |                    |                    | load_all()            |
    |                    |                    | (re-parse YAML)       |
    |                    |                    | acquire rules_lock    |
    |                    |                    | rules_ref[0] = new    |
    |                    |                    | release rules_lock    |
    |                    |                    |---------------------->|
    |                    |                    |      (next frame      |
    |                    |                    |       reads new rules)|
```

### Incident acknowledgement

```
Operator (browser)          Web App              Incident Service         Postgres
        |                      |                       |                     |
        | POST /incidents/{id} |                       |                     |
        |  /acknowledge        |                       |                     |
        |--------------------->|  (Next.js proxy or    |                     |
        |                      |   direct fetch)       |                     |
        |                      |---------------------->|                     |
        |                      |                       | SELECT incident     |
        |                      |                       |-------------------->|
        |                      |                       | UPDATE status='ack' |
        |                      |                       | INSERT audit_log    |
        |                      |                       |-------------------->|
        |                      |                       | COMMIT              |
        |                      |      200 IncidentOut  |                     |
        |                      |<----------------------|                     |
        | 200 (updated row)    |                       |                     |
        |<---------------------|   WS broadcast to     |                     |
        |                      |   all dashboard tabs  |                     |
```

## Backpressure

When Inference falls behind Ingestion:

1. `frames.raw` MAXLEN (1 000) is hit. Redis trims the oldest entries.
2. Ingestion continues publishing; trimmed frames are silently dropped (no crash).
3. Inference catches up by processing the newest available entries.
4. `ingestion_frames_published_total` vs `inference_frames_processed_total` diverge — the Prometheus alert `SafeVisionNoFramesIngested` fires if the gap is sustained.

To add backpressure instead of dropping: configure Ingestion to block on the queue (`asyncio.Queue(maxsize=10)` is already in the thread bridge — the SHM queue fills up, and the PyAV decode thread blocks on `fut.result(timeout=5.0)`).

## Multi-plant Topology

```
Plant A                               Plant B
┌──────────────────────────────┐      ┌──────────────────────────────┐
│  Ingestion → Inference       │      │  Ingestion → Inference       │
│  Rule Engine → Incident      │      │  Rule Engine → Incident      │
│  Notification → n8n          │      │  Notification → n8n          │
│  Redis (local)               │      │  Redis (local)               │
│  Postgres (local)            │      │  Postgres (local)            │
└────────────┬─────────────────┘      └─────────────────┬────────────┘
             │  VPN / WireGuard                         │
             └──────────────────────┬───────────────────┘
                                    │
                          ┌─────────┴──────────┐
                          │  Central MinIO     │
                          │  Central Grafana   │
                          │  (cross-plant dash)│
                          └────────────────────┘
```

Each plant runs a full stack. Incident clips are replicated to central MinIO over the VPN. Grafana reads Prometheus data from each plant's Prometheus via `remote_read` or federation.
