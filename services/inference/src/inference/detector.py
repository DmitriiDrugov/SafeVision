"""YOLOv8 Object Detector using ONNX Runtime.

Loads an ONNX model exported from a YOLOv8 architecture and runs inference
on single BGR frames (OpenCV convention). Postprocessing includes NMS and
confidence filtering.
"""
from __future__ import annotations

import time
from pathlib import Path

import cv2
import numpy as np
import structlog
from prometheus_client import Counter, Histogram

from schemas.detection import BoundingBox, TrackedObject

logger = structlog.get_logger(__name__)

_inference_latency = Histogram(
    "inference_latency_seconds",
    "Per-frame inference latency",
    ["model"],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0),
)
_detections_total = Counter(
    "inference_detections_total",
    "Total detected objects",
    ["class_name"],
)

# Safety-domain class list — index 0 corresponds to first ONNX output class
SUPPORTED_CLASSES = [
    "person",
    "helmet",
    "vest",
    "gloves",
    "mask",
    "forklift",
    "vehicle",
]

_CONFIDENCE_THRESHOLD = 0.4
_NMS_IOU_THRESHOLD = 0.45
_INPUT_SIZE = (640, 640)  # (width, height)


class Detector:
    def __init__(self, model_path: str, device: str = "cuda") -> None:
        import onnxruntime as ort

        model_path = str(Path(model_path))
        providers: list[str] = (
            ["CUDAExecutionProvider", "CPUExecutionProvider"]
            if device == "cuda"
            else ["CPUExecutionProvider"]
        )

        logger.info("detector.loading", model=model_path, device=device)
        self._session = ort.InferenceSession(model_path, providers=providers)
        self._input_name: str = self._session.get_inputs()[0].name
        self._model_name = Path(model_path).stem
        # Detect number of classes from output shape
        output_shape = self._session.get_outputs()[0].shape  # [1, 4+C, N]
        self._num_classes = int(output_shape[1]) - 4 if output_shape[1] else len(SUPPORTED_CLASSES)

        active_providers = self._session.get_providers()
        logger.info("detector.loaded", providers=active_providers, num_classes=self._num_classes)

    def detect(self, frame: np.ndarray) -> list[TrackedObject]:
        """Run YOLOv8 inference on a single BGR frame.

        Returns TrackedObject list with track_id=0 (Tracker assigns real IDs).
        """
        t0 = time.perf_counter()
        orig_h, orig_w = frame.shape[:2]

        blob = self._preprocess(frame)
        outputs = self._session.run(None, {self._input_name: blob})
        detections = self._postprocess(outputs, (orig_h, orig_w))

        elapsed = time.perf_counter() - t0
        _inference_latency.labels(model=self._model_name).observe(elapsed)

        for obj in detections:
            _detections_total.labels(class_name=obj.class_name).inc()

        return detections

    def _preprocess(self, frame: np.ndarray) -> np.ndarray:
        """BGR HWC → RGB NCHW float32 [0, 1] at 640×640."""
        resized = cv2.resize(frame, _INPUT_SIZE)
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
        nchw = np.transpose(rgb, (2, 0, 1))[np.newaxis].astype(np.float32) / 255.0
        return nchw

    def _postprocess(
        self,
        outputs: list[np.ndarray],
        orig_shape: tuple[int, int],
    ) -> list[TrackedObject]:
        """Decode YOLOv8 ONNX output, apply NMS, scale boxes to original pixels.

        YOLOv8 ONNX output: [1, 4+num_classes, num_anchors]
          rows 0-3: cx, cy, w, h (in 640×640 space)
          rows 4+:  per-class confidence scores
        """
        orig_h, orig_w = orig_shape
        pred = outputs[0]  # shape [1, 4+C, N]
        pred = pred[0]     # shape [4+C, N]
        pred = pred.T      # shape [N, 4+C]

        boxes_cxcywh = pred[:, :4]
        class_scores = pred[:, 4:]  # [N, C]

        class_ids = np.argmax(class_scores, axis=1)
        confidences = class_scores[np.arange(len(class_scores)), class_ids]

        # Filter by confidence
        mask = confidences >= _CONFIDENCE_THRESHOLD
        boxes_cxcywh = boxes_cxcywh[mask]
        class_ids = class_ids[mask]
        confidences = confidences[mask]

        if len(boxes_cxcywh) == 0:
            return []

        # Convert cx,cy,w,h → x1,y1,w,h (OpenCV NMSBoxes format)
        boxes_xywh = boxes_cxcywh.copy()
        boxes_xywh[:, 0] = boxes_cxcywh[:, 0] - boxes_cxcywh[:, 2] / 2
        boxes_xywh[:, 1] = boxes_cxcywh[:, 1] - boxes_cxcywh[:, 3] / 2

        indices = cv2.dnn.NMSBoxes(
            bboxes=boxes_xywh.tolist(),
            scores=confidences.tolist(),
            score_threshold=_CONFIDENCE_THRESHOLD,
            nms_threshold=_NMS_IOU_THRESHOLD,
        )
        if indices is None or len(indices) == 0:
            return []

        indices = np.array(indices).flatten()

        # Scale from 640×640 back to original dimensions
        scale_x = orig_w / _INPUT_SIZE[0]
        scale_y = orig_h / _INPUT_SIZE[1]

        results: list[TrackedObject] = []
        for i in indices:
            cx, cy, w, h = boxes_cxcywh[i]
            x1 = float((cx - w / 2) * scale_x)
            y1 = float((cy - h / 2) * scale_y)
            x2 = float((cx + w / 2) * scale_x)
            y2 = float((cy + h / 2) * scale_y)

            cls_idx = int(class_ids[i])
            class_name = (
                SUPPORTED_CLASSES[cls_idx]
                if cls_idx < len(SUPPORTED_CLASSES)
                else f"class_{cls_idx}"
            )

            results.append(
                TrackedObject(
                    track_id=0,
                    class_name=class_name,
                    confidence=float(confidences[i]),
                    bbox=BoundingBox(
                        x1=max(0.0, x1),
                        y1=max(0.0, y1),
                        x2=max(0.0, x2),
                        y2=max(0.0, y2),
                    ),
                )
            )
        return results
