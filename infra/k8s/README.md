# Kubernetes / Helm

Helm chart for production deployments. Targets:

- **Single-plant edge**: k3s on plant network with one GPU node + a few CPU nodes.
- **Multi-plant**: per-plant k3s for inference; a central management cluster aggregates incidents.

## Chart Structure

```
infra/k8s/safevision/
  Chart.yaml
  values.yaml             # default config (internal Postgres, Redis, MinIO; CPU inference)
  values.prod.yaml        # production overrides (external datastores, GPU, TLS, multi-replica)
  templates/
    _helpers.tpl          # name/label/image/URL helper templates
    secret.yaml           # JWT secret, auth users, DB + MinIO + webhook credentials
    pvc.yaml              # frame-archive, models, rules PersistentVolumeClaims
    ingestion-deployment.yaml
    inference-deployment.yaml    # nodeSelector + tolerations when gpu.enabled: true
    rule-engine-deployment.yaml
    incident-deployment.yaml
    notification-deployment.yaml
    web-deployment.yaml
    postgres-statefulset.yaml    # conditional on postgres.internal: true
    redis-statefulset.yaml       # conditional on redis.internal: true
    minio-statefulset.yaml       # conditional on minio.internal: true
    ingress.yaml                 # conditional on ingress.enabled: true
    servicemonitor.yaml          # Prometheus Operator; conditional on monitoring.serviceMonitor.enabled
```

## Quickstart (k3s / local cluster)

```bash
# 1. Create namespace
kubectl create namespace safevision

# 2. Install with defaults (internal Postgres, Redis, MinIO; CPU inference)
helm upgrade --install safevision infra/k8s/safevision \
  --namespace safevision \
  --set auth.secretKey=$(python -c "import secrets; print(secrets.token_hex(32))") \
  --set postgres.password=mysecretpassword \
  --set minio.rootPassword=miniomysecret

# 3. Watch rollout
kubectl rollout status deployment -n safevision --timeout=5m

# 4. Port-forward the UI
kubectl port-forward svc/safevision-web 3000:3000 -n safevision
```

## Production Deployment (external datastores + GPU + TLS)

```bash
helm upgrade --install safevision infra/k8s/safevision \
  --namespace safevision \
  -f infra/k8s/safevision/values.yaml \
  -f infra/k8s/safevision/values.prod.yaml \
  --set auth.secretKey=$SECRET_KEY \
  --set auth.authUsers="admin:${ADMIN_PASS}:admin,op1:${OP1_PASS}:operator" \
  --set postgres.url="postgresql+asyncpg://${DB_USER}:${DB_PASS}@${DB_HOST}:5432/safevision" \
  --set redis.url="redis://${REDIS_HOST}:6379" \
  --set minio.endpoint="${MINIO_HOST}:9000" \
  --set minio.accessKey=$MINIO_ACCESS \
  --set minio.secretKey=$MINIO_SECRET \
  --set ingress.host=safevision.yourdomain.com \
  --set global.imageTag=0.1.0
```

## Secrets management

For production, avoid passing secrets via `--set`. Options:

- **Sealed Secrets** (Bitnami): encrypt secrets with `kubeseal`, commit the
  SealedSecret manifest, the controller decrypts at runtime.
- **External Secrets Operator**: pull from AWS Secrets Manager, Vault, GCP
  Secret Manager directly into Kubernetes Secrets.
- **Helm Secrets** plugin: encrypt values files with GPG/age.

## Populating the model volume

The inference service expects a YOLOv8 ONNX model at `MODEL_PATH`
(default `/models/yolov8n-ppe.onnx`). After installing the chart:

```bash
# Copy model into the models PVC via a temporary pod
kubectl run model-loader --rm -it --restart=Never \
  --image=busybox \
  --overrides='{"spec":{"volumes":[{"name":"m","persistentVolumeClaim":{"claimName":"safevision-models"}}],"containers":[{"name":"model-loader","image":"busybox","command":["sh"],"volumeMounts":[{"name":"m","mountPath":"/models"}]}]}}' \
  -n safevision
# Inside the pod: wget <model-url> -O /models/yolov8n-ppe.onnx && exit
```

## GPU node setup (k3s)

1. Install NVIDIA device plugin:
   ```bash
   kubectl apply -f https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/v0.14.5/nvidia-device-plugin.yml
   ```
2. Label the GPU node:
   ```bash
   kubectl label node <gpu-node> nvidia.com/gpu=true
   ```
3. Enable GPU in values:
   ```bash
   --set inference.gpu.enabled=true --set inference.device=cuda
   ```
