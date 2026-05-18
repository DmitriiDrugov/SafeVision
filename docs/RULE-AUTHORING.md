# Rule Authoring Guide

Rules are declarative YAML documents loaded by the Rule Engine. They describe *what* to detect; matched rules surface as incidents in the SafeVision web UI.

> **Note:** there is no WhatsApp / email / webhook channel. Operators triage all incidents from the dashboard. Schemas that previously included a `channel` field have been removed.

## Schema Reference

The canonical schema is in [`shared/schemas/rule.schema.yaml`](../shared/schemas/rule.schema.yaml). The Pydantic model in [`shared/schemas/rule.py`](../shared/schemas/rule.py) is the source of truth — invalid YAML is rejected at load time with a structured error.

```yaml
rule:
  name: <snake_case_string>          # Required, unique
  zone: <zone_id_string>             # Required; must match a zone on the camera
  condition:
    object: person | forklift | vehicle
    missing_ppe: helmet | vest | gloves | mask   # Optional
    action: entering | exiting | standing | moving  # Optional
    duration_seconds: <number>       # Optional; >0
    min_count: <integer>             # Optional; >=1
  action:
    type: alert | log | block
    severity: low | medium | high | critical
  enabled: true | false
```

## Examples

### 1. PPE compliance — helmets in the welding bay

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
  enabled: true
```

### 2. Restricted-zone access — vehicles in pedestrian corridor

```yaml
rule:
  name: vehicle_in_pedestrian_corridor
  zone: pedestrian_corridor
  condition:
    object: vehicle
    action: entering
  action:
    type: alert
    severity: critical
  enabled: true
```

### 3. Crowding — multiple persons in confined space for too long

```yaml
rule:
  name: crowding_in_loading_dock
  zone: loading_dock
  condition:
    object: person
    action: standing
    duration_seconds: 60
    min_count: 4
  action:
    type: log
    severity: medium
  enabled: true
```

## Activating a Rule

### Via the Web UI

1. Navigate to `/configure`.
2. Describe the rule in plain English. The chat builder produces a YAML preview.
3. Click **Activate**. The UI sends the YAML to `POST /api/v1/rules`. Server-side validation runs against the Pydantic model — invalid YAML is rejected and re-prompted.

### Via the REST API

```bash
curl -X POST https://<host>/api/v1/rules \
  -H 'Content-Type: application/json' \
  -d '{ "yaml": "rule:\n  name: example\n  zone: zone_a\n  condition:\n    object: person\n    missing_ppe: helmet\n  action:\n    type: alert\n    severity: high\n  enabled: true" }'
```

### Via Git (production-grade)

Drop YAML files into the configured `rules/` directory. The Rule Engine picks them up via `watchdog` within ~1 second — no service restart required. Recommend storing rules in a separate Git repo synced to the host.

## Naming Conventions

- `name` is `snake_case`, prefixed with the violation type:
  - `no_<ppe>_<zone>` — PPE violations
  - `<object>_<action>_<zone>` — zone violations
- `name` must be unique across the whole system (it is the primary key).

## Severity Guidelines

| Severity | Example use case | Dashboard treatment |
|---|---|---|
| `low` | Logging only, e.g. occasional movement near machinery | Counted; visible in feed |
| `medium` | Operator awareness, no immediate intervention | Highlighted in feed; operator triages |
| `high` | Supervisor must act within minutes | Prominent banner; on-shift supervisor pages |
| `critical` | Immediate intervention; risk to life | Top-of-dashboard banner; pulse animation |

## Validation Errors

Common errors when authoring:
- `name` not snake_case → fix: lowercase letters, digits, underscores only.
- Unknown `object` / `missing_ppe` value → check spelling against schema enums.
- `duration_seconds` ≤ 0 → must be strictly positive.
- `zone` not defined on any camera → no error at rule load time, but the rule will never trigger.
- A leftover `channel:` field → remove it; the field no longer exists.

The Rule Engine logs a structured `rule_invalid` event for each rejection. Check Loki for `service=rule-engine event=rule_invalid` to debug.
