# Incident Service

Consumes `ViolationStreamEvent` messages from the `events.violation` Redis Stream, persists incidents to PostgreSQL (TimescaleDB), stores evidence video clips in MinIO, and exposes the REST + WebSocket API consumed by the Configuration UI.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | `postgresql+asyncpg://user:pass@host:5432/db` |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection string |
| `MINIO_ENDPOINT` | `localhost:9000` | MinIO host:port |
| `MINIO_ACCESS_KEY` | — | MinIO access key |
| `MINIO_SECRET_KEY` | — | MinIO secret key |
| `MINIO_BUCKET_INCIDENTS` | `incidents` | Bucket for evidence clips |
| `MINIO_USE_SSL` | `false` | Enable TLS for MinIO connection |
| `METRICS_PORT` | `8004` | Prometheus metrics path (`/metrics`) on same port as API |
| `LOG_LEVEL` | `INFO` | structlog log level |

## Running Locally

```bash
pip install -e shared/schemas
pip install -e shared/proto
pip install -e services/incident

# Run database migrations first
alembic -c services/incident/alembic.ini upgrade head

DATABASE_URL=postgresql+asyncpg://safevision:changeme@localhost:5432/safevision \
  REDIS_URL=redis://localhost:6379 \
  uvicorn incident.main:app --port 8004 --reload
```

## Running Tests

```bash
pytest services/incident/tests/ -v
```

## Docker Build

```bash
docker build -f services/incident/Dockerfile -t safevision-incident .
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/metrics` | Prometheus metrics |
| `GET` | `/api/v1/incidents` | List incidents (paginated) |
| `GET` | `/api/v1/incidents/{id}` | Get single incident |
| `POST` | `/api/v1/incidents/{id}/acknowledge` | Acknowledge incident |
| `POST` | `/api/v1/incidents/{id}/resolve` | Resolve incident |
| `GET` | `/api/v1/incidents/{id}/evidence` | Get presigned MinIO URL for clip |
| `WS` | `/api/v1/stream/incidents` | Real-time incident WebSocket feed |

## Database Migrations

```bash
# Generate a new migration
alembic -c services/incident/alembic.ini revision --autogenerate -m "describe change"

# Apply migrations
alembic -c services/incident/alembic.ini upgrade head
```
