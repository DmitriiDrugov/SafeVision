# Integration Tests

End-to-end tests against a running `docker compose` stack.

## Setup

```bash
docker compose -f infra/docker-compose/docker-compose.yml up -d
# Wait for all services to report healthy
docker compose -f infra/docker-compose/docker-compose.yml ps
```

## Running

```bash
pytest tests/integration -v
```

## TODO Test Cases

- `test_synthetic_detection_creates_incident`: publish a synthetic
  DetectionStreamEvent on `detections.frame`, assert an Incident row
  appears in PostgreSQL within 2 seconds.
- `test_rule_hot_reload`: drop a new YAML file into the rules dir,
  publish a matching detection, assert violation fires (no service restart).
- `test_clip_storage_roundtrip`: simulate an incident, fetch presigned URL
  from MinIO, download, assert non-zero bytes.
- `test_websocket_broadcast`: open a WebSocket to /ws/incidents, publish
  a violation, assert the message arrives within 1 second.
