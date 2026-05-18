# Grafana

Dashboards as JSON, provisioned automatically into the Grafana container.

TODO: Build the following dashboards:

- **Plant Overview** — total incidents (24h, 7d, 30d), severity distribution, top 5 rules by trigger count, camera health summary.
- **Per-Camera Health** — fps, inference latency p50/p95/p99, reconnect count, frames dropped, last detection timestamp.
- **Incident Funnel** — frames in → detections → rule matches → incidents. Useful for tuning false-positive rates.

## Provisioning

Mount this directory at `/etc/grafana/provisioning/dashboards/` in `docker-compose.yml` (TODO; not wired up yet).
