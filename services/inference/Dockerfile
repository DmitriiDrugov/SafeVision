# Build context: repo root (docker build -f services/inference/Dockerfile .)
# Requires NVIDIA Container Toolkit on the host for GPU passthrough.
# For CPU-only dev: replace base image with python:3.11-slim and install
# onnxruntime instead of onnxruntime-gpu.
FROM nvidia/cuda:12.3.0-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-dev \
    python3-pip \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN ln -sf /usr/bin/python3.11 /usr/bin/python3 && \
    ln -sf /usr/bin/python3 /usr/bin/python && \
    ln -sf /usr/bin/pip3 /usr/bin/pip

RUN useradd -m -u 1001 appuser
WORKDIR /app

COPY shared/schemas /app/shared/schemas
COPY shared/proto /app/shared/proto
RUN pip install --no-cache-dir -e /app/shared/schemas && \
    pip install --no-cache-dir -e /app/shared/proto

COPY services/inference/pyproject.toml /app/services/inference/pyproject.toml
RUN pip install --no-cache-dir -e "/app/services/inference"

COPY services/inference/src /app/services/inference/src

ENV PYTHONPATH=/app/services/inference/src
ENV MODEL_PATH=/models/yolov8n-ppe.onnx

USER appuser

HEALTHCHECK --interval=15s --timeout=10s --retries=3 \
    CMD python -c "import inference; print('ok')"

CMD ["python", "-m", "inference.main"]
