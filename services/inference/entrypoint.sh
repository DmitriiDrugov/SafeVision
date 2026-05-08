#!/usr/bin/env bash
# Inference service entrypoint.
# Exports a base YOLOv8n ONNX model on first boot when the model file is absent.
# In production, set MODEL_URL to download your fine-tuned PPE model instead.
set -euo pipefail

MODEL_PATH="${MODEL_PATH:-/models/yolov8n-ppe.onnx}"
MODEL_URL="${MODEL_URL:-}"
MODEL_DIR="$(dirname "$MODEL_PATH")"

if [[ ! -f "$MODEL_PATH" ]]; then
    mkdir -p "$MODEL_DIR"

    if [[ -n "$MODEL_URL" ]]; then
        echo "[entrypoint] Downloading model from $MODEL_URL ..."
        curl --fail --location --retry 3 --retry-delay 5 \
             --output "$MODEL_PATH" "$MODEL_URL"
        echo "[entrypoint] Model ready at $MODEL_PATH"
    else
        echo "[entrypoint] No MODEL_URL set — exporting base YOLOv8n as dev placeholder."
        echo "[entrypoint] WARNING: base model detects COCO classes, not PPE."
        python3 - <<PYEOF
import os, shutil
from pathlib import Path
from ultralytics import YOLO
target = Path("${MODEL_PATH}")
target.parent.mkdir(parents=True, exist_ok=True)
model = YOLO("yolov8n.pt")
onnx = model.export(format="onnx", imgsz=640, opset=12, simplify=True, dynamic=False)
shutil.move(str(onnx), str(target))
print(f"[entrypoint] Exported to {target}")
PYEOF
    fi
fi

exec "$@"
