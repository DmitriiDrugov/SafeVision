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
# Edit .env — change all passwords before starting
docker compose -f infra/docker-compose/docker-compose.yml up -d
```

After first boot, create the n8n database (one-time):

```bash
docker exec -it safevision-postgres-1 createdb -U safevision n8n
docker compose -f infra/docker-compose/docker-compose.yml restart n8n
```

Verify all services are healthy:

```bash
docker compose -f infra/docker-compose/docker-compose.yml ps
# All containers should show "healthy"
```

Access points:
| UI | URL |
|---|---|
| SafeVision Config UI | http://localhost:3000 |
| Grafana | http://localhost:3001 (admin / see .env) |
| Prometheus | http://localhost:9090 |
| n8n | http://localhost:5678 |
| MinIO Console | http://localhost:9001 |

### Production (single plant)

**1. Provision the host**

```bash
# Install k3s (single-node)
curl -sfL https://get.k3s.io | sh -

# (GPU host) install NVIDIA Container Toolkit
distribution=$(. /etc/os-release; echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/libnvidia-container/gpgkey | sudo apt-key add -
apt-get install -y nvidia-container-toolkit
systemctl restart k3s
```

**2. Push images to your registry**

```bash
docker buildx bake --push \
  --set "*.tags=registry.yourplant.local/safevision/<service>:$(git rev-parse --short HEAD)"
```

**3. Deploy with Helm (infra/k8s)**

```bash
helm upgrade --install safevision infra/k8s/chart \
  --namespace safevision --create-namespace \
  --set image.tag=$(git rev-parse --short HEAD) \
  --set inference.gpu=true \
  --values infra/k8s/values.plant-a.yaml
```

**Key Helm values to set per plant:**

```yaml
postgres:
  storageClass: local-path
  size: 50Gi

minio:
  storageClass: local-path
  size: 200Gi

inference:
  gpu: true
  nodeSelector:
    nvidia.com/gpu: "true"

cameras:
  - id: cam01
    name: Line A
    rtsp_url: rtsp://192.168.10.100:554/stream1
    zones: []
```

**4. TLS ingress** — configure cert-manager with a self-signed or Let's Encrypt issuer
and add an Ingress resource pointing to the web service on port 3000.

## Scaling

### Ingestion

One container handles 4–8 cameras. Beyond that, deploy multiple containers with
disjoint camera ID assignments. Scale by adding containers, not threads (PyAV
releases the GIL but FFmpeg buffers are thread-bound).

### Inference

GPU-bound. One RTX 3060 handles ~8 1080p streams at 5 fps with YOLOv8n. To scale:
- Vertical: upgrade GPU (RTX 4090 → ~32 streams)
- Horizontal: deploy multiple Inference pods with disjoint Redis Stream consumer names

### Rule Engine

CPU-bound but very lightweight. Scale only if rule count exceeds ~500. Redis
consumer groups allow parallel evaluation across replicas automatically.

### Incident / Notification

FastAPI + asyncio scales well; bottleneck is Postgres for writes. Add read replicas
and point `DATABASE_URL` to the replica for the list/get endpoints if dashboard
queries become slow.

## Camera Management

Camera configuration is managed through the Incident Service REST API and stored
in the database. Changes are published to the `safevision:cameras` Redis key and
picked up by the Ingestion service within `CAMERA_POLL_INTERVAL_SECS` (default
30 s) — **no restart required**.

### Adding a camera

```bash
curl -X POST http://localhost:8004/api/v1/cameras \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "cam02",
    "name": "Line B",
    "rtsp_url": "rtsp://192.168.10.101:554/stream1",
    "enabled": true,
    "zones": []
  }'
```

The RTSP URL is encrypted at rest. The response returns the decrypted URL.
Within 30 s the Ingestion service starts consuming frames from the new camera.

### Updating a camera or changing its RTSP URL

```bash
curl -X PUT http://localhost:8004/api/v1/cameras/cam02 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"rtsp_url": "rtsp://192.168.10.101:554/stream2"}'
```

The Ingestion service detects the URL change and restarts only that camera's
reader task — other cameras are unaffected.

### Disabling a camera

```bash
curl -X PUT http://localhost:8004/api/v1/cameras/cam02 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

### Removing a camera

```bash
curl -X DELETE http://localhost:8004/api/v1/cameras/cam02 \
  -H "Authorization: Bearer <token>"
```

### Testing RTSP connectivity

```bash
# From the Ingestion container
docker exec -it safevision-ingestion-1 \
  ffprobe -v error -show_streams rtsp://<camera-ip>/stream
```

### Zone coordinate system

Polygons are lists of `[x, y]` pairs in **normalised camera coordinates**:
- `[0.0, 0.0]` = top-left corner of the frame
- `[1.0, 1.0]` = bottom-right corner

Example — a zone covering the lower-left quarter:
```json
{"id": "loading_dock", "name": "Loading Dock", "polygon": [[0,0.5],[0.5,0.5],[0.5,1],[0,1]]}
```

## n8n Notification Workflows

See **[docs/N8N-WORKFLOWS.md](N8N-WORKFLOWS.md)** for the full setup guide
including workflow import, credential configuration, variable definitions, and
end-to-end testing.

Pre-built importable workflows:
- `infra/n8n/workflows/safevision-whatsapp-alerts.json` — Twilio WhatsApp
- `infra/n8n/workflows/safevision-email-alerts.json` — SMTP email

Quick start after workflow import:

1. Activate each workflow in n8n and copy the Production Webhook URL.
2. Set the URLs in `.env`:
   ```
   N8N_WHATSAPP_WEBHOOK_URL=https://n8n-host/webhook/safevision-whatsapp
   N8N_EMAIL_WEBHOOK_URL=https://n8n-host/webhook/safevision-email
   ```
3. `docker compose restart notification`

## Incident Response Playbook

### Severity handling

| Severity | SLA | First action |
|---|---|---|
| `critical` | 5 min | Plant safety officer paged via WhatsApp |
| `high` | 15 min | Supervisor notified via WhatsApp |
| `medium` | 60 min | Operator reviews via dashboard |
| `low` | Next shift | Logged; reviewed in daily safety report |

### Standard operator workflow

1. **Review** — open the Incidents page, filter by `status=open` and `severity=high,critical`.
2. **Acknowledge** — click **Ack** on the incident. Enter your operator ID. This pauses the
   escalation timer and signals the system the incident is being handled.
3. **Investigate** — review the detection payload and evidence clip. If it looks like a
   genuine violation, proceed. If not, mark as **False Positive**.
4. **Resolve** — once the underlying hazard is fixed, click **Resolve** and add a note
   (e.g. "Guard rail reinstalled at 14:32").

### False positive triage

1. Mark the incident as **False Positive** (status → `false_positive`).
2. Note the rule name and timestamp. If the same rule fires FP repeatedly, it may need
   zone calibration or a stricter `min_count`/`duration_seconds` threshold.
3. Export the frame payload (from the incident detail JSON) to the retraining set at
   `s3://incidents/<incident_id>/payload.json` for model fine-tuning.

### After-hours escalation

If a `critical` incident is not acknowledged within 5 minutes:
- n8n escalation workflow triggers a second WhatsApp message to the on-call supervisor.
- After 15 minutes without acknowledgement, n8n sends an SMS/email to the plant manager.
- Configure the escalation workflow in n8n at `http://<host>:5678`.

## Alerting Playbook

Prometheus alerting rules live in `infra/docker-compose/alerts/safevision.yml`.

| Alert | Condition | Action |
|---|---|---|
| `SafeVisionIngestionDown` | No ingestion instance up for 2 min | Check RTSP source; restart Ingestion container |
| `SafeVisionInferenceDown` | No inference instance up for 2 min | Check GPU health (`nvidia-smi`); restart Inference |
| `SafeVisionRuleEngineDown` | No rule-engine instance up for 2 min | Restart; check rules directory is mounted |
| `SafeVisionNoFramesIngested` | 0 frames published in 5 min | RTSP source down or network issue — check cameras |
| `SafeVisionStreamReconnectLoop` | Reconnect rate > 0.5/s | Camera stream unstable; check network/RTSP config |
| `SafeVisionHighInferenceLatency` | p95 > 500 ms for 5 min | GPU memory pressure; reduce batch size or add GPU |
| `SafeVisionHighViolationRate` | > 100 violations/min for 5 min | Likely misconfigured rule — review and tighten condition |
| `SafeVisionDLQHigh` | DLQ depth > 10 for 5 min | n8n webhook failing — check n8n logs and endpoint config |
| `SafeVisionDLQCritical` | DLQ depth > 100 | Notifications completely backed up — treat as incident |

### Checking the DLQ

```bash
# Count events stuck in the DLQ
docker exec safevision-redis-1 redis-cli llen notifications.dlq

# Inspect top item without removing
docker exec safevision-redis-1 redis-cli lindex notifications.dlq 0

# Manually drain after fixing the webhook
curl -X POST http://localhost:8005/api/v1/dlq/retry
```

## Database Migrations (Alembic)

Migrations run automatically when the Incident Service starts (Alembic `upgrade head`).
For SQLite test environments, `create_all` is used instead.

### Checking migration status

```bash
# From services/incident/ with DATABASE_URL in env
alembic current          # current revision applied to the DB
alembic history          # full revision chain
alembic heads            # latest available revision
```

### Generating a new migration

After changing models in `services/incident/src/incident/db/models.py`:

```bash
cd services/incident
DATABASE_URL="postgresql+asyncpg://safevision:changeme@localhost:5432/safevision" \
  alembic revision --autogenerate -m "describe your change"
# Review the generated file in src/incident/db/migrations/versions/
# Edit if needed, then commit
```

### Manual upgrade / rollback

```bash
alembic upgrade head      # apply all pending migrations
alembic downgrade -1      # roll back one revision
alembic downgrade base    # roll back everything (dangerous in prod)
```

### Running migrations before a production deploy

In Kubernetes, use an init container that runs:
```bash
alembic -c /app/alembic.ini upgrade head
```

before the main Incident Service pod starts.

## Backup & Disaster Recovery

### Postgres backup

```bash
# Daily logical backup (run via cron or k8s CronJob)
docker exec safevision-postgres-1 \
  pg_dump -U safevision safevision | gzip > /backups/safevision-$(date +%Y%m%d).sql.gz

# Retention: keep 30 daily backups
find /backups -name "safevision-*.sql.gz" -mtime +30 -delete
```

### MinIO clip replication

Enable MinIO bucket replication to an off-site target:

```bash
mc alias set local http://localhost:9000 minioadmin <password>
mc alias set remote https://minio.central.yourplant.com minioadmin <password>
mc replicate add local/incidents --remote-bucket incidents --arn <replication-arn>
```

### Rule configuration backup

Rules are plain YAML files in the `rules/` volume. Commit them to a Git repo:

```bash
# Export current rules
docker cp safevision-rule-engine-1:/etc/safevision/rules ./rules-backup
git -C rules-backup add -A && git -C rules-backup commit -m "rules backup $(date)"
git -C rules-backup push
```

### Recovery objectives

| Component | RPO | RTO |
|---|---|---|
| Incident database (Postgres) | 24 h (daily backup) | ~15 min (restore + restart) |
| Evidence clips (MinIO) | Near-zero (replication) | ~5 min (redirect to replica) |
| Rules (YAML files) | ~0 (Git-backed) | ~2 min (clone + restart rule-engine) |
| Live video processing | N/A (no persistence) | ~3 min (container restart) |
