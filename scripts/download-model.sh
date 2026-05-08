#!/usr/bin/env bash
# Download or export the YOLOv8-PPE ONNX model for the inference service.
#
# Production use:
#   Set MODEL_URL to your hosted .onnx file and this script will curl it down.
#   Example:
#     MODEL_URL=https://your-storage.example.com/models/yolov8n-ppe.onnx ./scripts/download-model.sh
#
# Development / CI (no MODEL_URL set):
#   Exports the stock YOLOv8n base model to ONNX via the ultralytics package.
#   The exported model detects COCO classes, not PPE — good enough for pipeline
#   testing but NOT suitable for production safety monitoring.
#
# Environment variables:
#   MODEL_DIR   Directory to place the model (default: /models)
#   MODEL_URL   Optional remote URL to download a production model from
#   SKIP_IF_EXISTS  Set to "1" to exit 0 immediately if the model already exists

set -euo pipefail

MODEL_DIR="${MODEL_DIR:-/models}"
MODEL_NAME="yolov8n-ppe.onnx"
MODEL_PATH="${MODEL_DIR}/${MODEL_NAME}"
SKIP_IF_EXISTS="${SKIP_IF_EXISTS:-1}"

mkdir -p "$MODEL_DIR"

if [[ "$SKIP_IF_EXISTS" == "1" && -f "$MODEL_PATH" ]]; then
    echo "[download-model] Model already present at $MODEL_PATH — skipping."
    exit 0
fi

# ── Production: download from URL ────────────────────────────────────────────

if [[ -n "${MODEL_URL:-}" ]]; then
    echo "[download-model] Downloading model from $MODEL_URL ..."
    curl --fail --location --progress-bar \
         --retry 3 --retry-delay 5 \
         --output "$MODEL_PATH" \
         "$MODEL_URL"
    echo "[download-model] Downloaded to $MODEL_PATH"
    exit 0
fi

# ── Development: export base YOLOv8n via ultralytics ─────────────────────────

echo "[download-model] No MODEL_URL set — exporting base YOLOv8n to ONNX (dev placeholder)."
echo "[download-model] WARNING: this model detects COCO classes, not PPE."
echo "[download-model] Replace with a PPE-trained model before production use."

# Require Python 3.11+
PYTHON="${PYTHON:-python3}"
if ! "$PYTHON" -c "import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)"; then
    echo "[download-model] ERROR: Python 3.11+ required." >&2
    exit 1
fi

# Install ultralytics if not already available
if ! "$PYTHON" -c "import ultralytics" 2>/dev/null; then
    echo "[download-model] Installing ultralytics (one-time)..."
    "$PYTHON" -m pip install --quiet "ultralytics>=8.0"
fi

"$PYTHON" - <<PYEOF
import os
import shutil
from pathlib import Path
from ultralytics import YOLO

model_dir = Path("${MODEL_DIR}")
target = model_dir / "${MODEL_NAME}"
model_dir.mkdir(parents=True, exist_ok=True)

print("[download-model] Loading YOLOv8n weights (downloads ~6 MB on first run)...")
model = YOLO("yolov8n.pt")

print("[download-model] Exporting to ONNX (imgsz=640, opset=12)...")
onnx_path = model.export(format="onnx", imgsz=640, opset=12, simplify=True, dynamic=False)

shutil.move(str(onnx_path), str(target))
print(f"[download-model] Model ready at {target}")
PYEOF
