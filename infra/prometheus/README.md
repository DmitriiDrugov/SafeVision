# Prometheus Alerts

TODO: Alert rule files that will be mounted into the Prometheus container at
`/etc/prometheus/alerts/*.yml`.

## Planned Alerts

```yaml
groups:
  - name: safevision-availability
    rules:
      - alert: CameraDisconnected
        expr: time() - frames_published_timestamp_seconds > 30
        for: 30s
        labels:
          severity: high
        annotations:
          summary: "Camera {{ $labels.camera_id }} has not published frames for >30s"

      - alert: InferenceLagHigh
        expr: histogram_quantile(0.95, rate(inference_latency_seconds_bucket[5m])) > 0.5
        for: 5m
        labels:
          severity: medium
```

To activate, uncomment `rule_files:` in `infra/docker-compose/prometheus.yml`
and mount this directory.
