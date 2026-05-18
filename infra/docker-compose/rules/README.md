# Safety Rules

YAML files in this directory are loaded by the Rule Engine at startup and
hot-reloaded whenever a file changes. Add, edit, or delete files here to
configure safety rules without restarting any service.

## Starter rules (for pipeline testing)

| File | Trigger | Severity |
|---|---|---|
| `person_detected.yaml` | Any person visible | low |
| `no_helmet.yaml` | Person without helmet | high |
| `no_vest.yaml` | Person without safety vest | high |
| `crowding.yaml` | 3 or more people at once | medium |

> **Note:** these rules use `zone: site`. Because the starter camera has no
> zone polygons configured, the evaluator passes all objects through (empty
> `zone_ids` = not yet zone-tagged). Define real zones in the Config UI at
> http://localhost:3000/configure to restrict rules to specific areas.

## Rule schema

```yaml
rule:
  name: snake_case_unique_name    # used as the rule ID
  zone: zone_id                   # zone to watch (or any zone if not assigned)
  condition:
    object: person | forklift | vehicle
    missing_ppe: helmet | vest | gloves | mask   # optional
    action: entering | exiting | standing | moving  # optional
    duration_seconds: 30          # optional — must persist this long
    min_count: 2                  # optional — minimum matching objects
  action:
    type: alert | log
    severity: low | medium | high | critical
  enabled: true
```

See [docs/RULE-AUTHORING.md](../../../docs/RULE-AUTHORING.md) for full reference.
