# Kubernetes / Helm

TODO: Helm chart for production deployments. Targets:

- **Single-plant edge**: k3s on plant network with one GPU node + a few CPU nodes.
- **Multi-plant**: per-plant k3s for inference; a central management cluster aggregates incidents.

## Planned Chart Structure

```
infra/k8s/safevision/
  Chart.yaml
  values.yaml             # default config
  values.prod.yaml        # production overrides
  templates/
    ingestion-deployment.yaml
    inference-deployment.yaml      # nodeSelector + tolerations for GPU
    rule-engine-deployment.yaml
    incident-deployment.yaml
    notification-deployment.yaml
    web-deployment.yaml
    postgres-statefulset.yaml      # or external managed Postgres
    minio-statefulset.yaml
    ingress.yaml                   # Traefik or nginx
    secrets-sealed.yaml            # SealedSecrets / External Secrets
    servicemonitor.yaml            # Prometheus Operator
```
