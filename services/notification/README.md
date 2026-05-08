# Notification Service

Consumes `ViolationStreamEvent` messages from the `events.violation` Redis Stream and routes alerts to the appropriate channels via n8n webhooks. Also exposes a WebSocket endpoint for the Configuration UI's real-time incident dashboard.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection string |
| `N8N_WHATSAPP_WEBHOOK_URL` | — | n8n webhook URL for WhatsApp notifications |
| `N8N_EMAIL_WEBHOOK_URL` | — | n8n webhook URL for email notifications |
| `WEBHOOK_TIMEOUT_SECONDS` | `10` | Per-attempt timeout for webhook calls |
| `WEBHOOK_MAX_RETRIES` | `3` | Maximum retry attempts per notification |
| `METRICS_PORT` | `8005` | Prometheus metrics path (`/metrics`) on same port as API |
| `LOG_LEVEL` | `INFO` | structlog log level |

## Running Locally

```bash
pip install -e shared/schemas
pip install -e shared/proto
pip install -e services/notification

REDIS_URL=redis://localhost:6379 \
  N8N_WHATSAPP_WEBHOOK_URL=http://localhost:5678/webhook/whatsapp \
  uvicorn notification.main:app --port 8005 --reload
```

## Running Tests

```bash
pytest services/notification/tests/ -v
```

## Architecture Notes

- Webhook calls use `httpx.AsyncClient` with a shared connection pool.
- Failed webhooks retry with exponential backoff: 1s, 2s, 4s.
- After `WEBHOOK_MAX_RETRIES` failures, the event is written to a Redis dead-letter key (`notifications.dlq`).
- The WebSocket endpoint at `/ws/incidents` broadcasts all incoming ViolationEvents to connected Config UI clients.

## Required SLIs

- `notifications_sent_total{channel, severity}` — counter
- `notifications_failed_total{channel, severity}` — counter
- `notification_delivery_duration_seconds{channel}` — histogram (p95 < 2s target)
- `dlq_size` — gauge (dead-letter queue length)
