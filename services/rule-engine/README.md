# Rule Engine

Consumes `DetectionStreamEvent` messages from the `detections.frame` Redis Stream, evaluates active YAML rules against each detection payload, and publishes `ViolationStreamEvent` messages to the `events.violation` stream when conditions are met.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection string |
| `RULES_DIR` | `/etc/safevision/rules` | Directory containing `*.yaml` rule files |
| `METRICS_PORT` | `8003` | Prometheus metrics HTTP port |
| `LOG_LEVEL` | `INFO` | structlog log level |

## Running Locally

```bash
pip install -e shared/schemas
pip install -e shared/proto
pip install -e services/rule-engine

REDIS_URL=redis://localhost:6379 RULES_DIR=./rules python -m rule_engine.main
```

## Rule Files

Place `*.yaml` files in `RULES_DIR`. Each file contains one rule conforming to `shared/schemas/rule.schema.yaml`. The Rule Engine watches the directory with watchdog and hot-reloads on any file change.

Example rule file (`rules/no_helmet.yaml`):
```yaml
rule:
  name: no_helmet_welding_bay
  zone: welding_bay
  condition:
    object: person
    missing_ppe: helmet
  action:
    type: alert
    severity: high
    channel: all
  enabled: true
```

See [docs/RULE-AUTHORING.md](../../docs/RULE-AUTHORING.md) for the full schema reference.

## Running Tests

```bash
pytest services/rule-engine/tests/ -v
```

## Required SLIs

- `rule_evaluations_total{rule_name, result}` — counter (result: match | no_match | error)
- `violations_emitted_total{rule_name, severity}` — counter
- `rules_loaded_total` — gauge (number of currently active rules)
- `rule_evaluation_latency_seconds` — histogram
