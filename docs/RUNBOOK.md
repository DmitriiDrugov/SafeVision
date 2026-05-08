# SafeVision Runbook

Operational guide for deploying, monitoring, and responding to issues.

## Prerequisites

- Docker 24+, Docker Compose v2
- (Production) NVIDIA Container Toolkit on the inference host
- (Production) Kubernetes 1.28+ with k3s for plant edge

## Deployment

### Dev

```bash
cp infra/docker-compose/.env.example infra/docker-compose/.env
# Edit .env — change passwords
docker compose -f infra/docker-compose/docker-compose.yml up -d
```

After first boot, create the n8n database (one-time setup):

```bash
docker exec -it safevision-postgres-1 createdb -U safevision n8n
docker compose -f infra/docker-compose/docker-compose.yml restart n8n
```

### Production (single plant)

TODO: Document Helm chart deployment to k3s, including:
- GPU node taints and tolerations
- Persistent volume claims for Postgres / MinIO
- Sealed Secrets / Vault integration
- Ingress with TLS termination

## Scaling

### Ingestion

One container handles 4–8 cameras. Beyond that, deploy multiple containers with disjoint camera ID assignments. Scale by adding more containers, not threads (PyAV releases the GIL but FFmpeg buffers are thread-bound).

### Inference

GPU-bound. One RTX 3060 handles ~8 1080p streams at 5 fps with YOLOv8n. To scale:
- Vertical: upgrade GPU (RTX 4090 → ~32 streams)
- Horizontal: deploy multiple Inference pods with disjoint Redis Stream consumer names

### Rule Engine

CPU-bound but very lightweight. Scale only if rule count exceeds ~500 per camera. Use Redis Stream consumer groups for parallel evaluation.

### Incident / Notification

FastAPI + asyncio scales well; bottleneck is Postgres for writes. Add read replicas if dashboard queries become slow.

## Camera Management

TODO:
- Adding a camera (config endpoint, zone polygon definition)
- Removing a camera cleanly (drain frames first)
- Coordinate system for zones (normalized [0,1] in camera frame)
- Testing RTSP connectivity from the Ingestion host

## Incident Response Playbook

TODO:
- False positive triage (Acknowledge → Mark False Positive → tag for retraining set)
- Severity escalation rules
- After-hours on-call rotation

## Alerting Playbook

Prometheus AlertManager rules (see `infra/prometheus/`):
- `CameraDisconnected`: no frames for >30s
- `InferenceLagHigh`: p95 inference_latency_seconds > 500ms for 5min
- `NotificationFailureRate`: failure rate > 5% in 5min
- `RuleEngineCrashLoop`: container restart count > 3 in 10min

TODO: document on-call response for each alert.

## Backup & Disaster Recovery

TODO:
- Postgres logical backup (pg_dump) cadence
- MinIO bucket replication
- Configuration export (rules, cameras) to Git
- Recovery time objective (RTO) and recovery point objective (RPO) targets
