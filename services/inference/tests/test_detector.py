"""Unit tests for Detector — all ONNX Runtime calls are mocked."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import numpy as np
from schemas.detection import TrackedObject


def _make_yolo_output(
    *,
    num_classes: int = 7,
    num_anchors: int = 8400,
    confidences: list[tuple[int, float]] | None = None,
) -> np.ndarray:
    """Build a minimal YOLOv8 ONNX output tensor [1, 4+C, N].

    confidences: list of (class_idx, score) for detections to inject
                 at anchor 0, 1, … in the output.
    """
    out = np.zeros((1, 4 + num_classes, num_anchors), dtype=np.float32)
    if confidences:
        for i, (cls_idx, score) in enumerate(confidences):
            # cx, cy, w, h — place box in centre of 640×640
            out[0, 0, i] = 320.0
            out[0, 1, i] = 320.0
            out[0, 2, i] = 100.0
            out[0, 3, i] = 100.0
            out[0, 4 + cls_idx, i] = score
    return out


def _make_mock_session(output: np.ndarray) -> MagicMock:
    session = MagicMock()
    session.get_inputs.return_value = [MagicMock(name="images")]
    session.get_outputs.return_value = [MagicMock(shape=[1, output.shape[1], output.shape[2]])]
    session.run.return_value = [output]
    session.get_providers.return_value = ["CPUExecutionProvider"]
    return session


def _make_detector(session: MagicMock, device: str = "cpu") -> object:
    from inference.detector import Detector

    with patch("onnxruntime.InferenceSession", return_value=session):
        return Detector(model_path="/fake/model.onnx", device=device)


class TestPreprocess:
    def test_output_shape_is_nchw_640(self) -> None:
        from inference.detector import Detector

        session = _make_mock_session(np.zeros((1, 11, 8400), dtype=np.float32))
        with patch("onnxruntime.InferenceSession", return_value=session):
            det = Detector(model_path="/fake/model.onnx", device="cpu")

        frame = np.random.randint(0, 255, (1080, 1920, 3), dtype=np.uint8)
        blob = det._preprocess(frame)

        assert blob.shape == (1, 3, 640, 640)
        assert blob.dtype == np.float32
        assert blob.min() >= 0.0
        assert blob.max() <= 1.0

    def test_normalisation_range(self) -> None:
        from inference.detector import Detector

        session = _make_mock_session(np.zeros((1, 11, 8400), dtype=np.float32))
        with patch("onnxruntime.InferenceSession", return_value=session):
            det = Detector(model_path="/fake/model.onnx", device="cpu")

        frame = np.full((480, 640, 3), 255, dtype=np.uint8)
        blob = det._preprocess(frame)
        assert abs(float(blob.max()) - 1.0) < 1e-5


class TestDetect:
    def test_returns_tracked_objects_for_confident_detections(self) -> None:
        output = _make_yolo_output(confidences=[(0, 0.9), (4, 0.8)])  # person, mask
        session = _make_mock_session(output)
        det = _make_detector(session)

        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        results = det.detect(frame)

        assert isinstance(results, list)
        assert all(isinstance(r, TrackedObject) for r in results)
        assert len(results) >= 1

    def test_filters_low_confidence_detections(self) -> None:
        # Score 0.2 < threshold 0.4
        output = _make_yolo_output(confidences=[(0, 0.2)])
        session = _make_mock_session(output)
        det = _make_detector(session)

        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        results = det.detect(frame)

        assert len(results) == 0

    def test_track_id_zero_before_tracking(self) -> None:
        output = _make_yolo_output(confidences=[(0, 0.9)])
        session = _make_mock_session(output)
        det = _make_detector(session)

        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        results = det.detect(frame)

        for obj in results:
            assert obj.track_id == 0

    def test_empty_frame_returns_empty_list(self) -> None:
        output = _make_yolo_output()  # all zeros — no confident detections
        session = _make_mock_session(output)
        det = _make_detector(session)

        frame = np.zeros((640, 640, 3), dtype=np.uint8)
        results = det.detect(frame)

        assert results == []


class TestProviderSelection:
    def test_cpu_provider_when_device_is_cpu(self) -> None:
        captured_providers: list[list[str]] = []

        def _capture_session(path: str, providers: list[str]) -> MagicMock:
            captured_providers.append(providers)
            session = MagicMock()
            session.get_inputs.return_value = [MagicMock(name="images")]
            session.get_outputs.return_value = [
                MagicMock(shape=[1, 11, 8400])
            ]
            session.get_providers.return_value = providers
            return session

        from inference.detector import Detector

        with patch("onnxruntime.InferenceSession", side_effect=_capture_session):
            Detector(model_path="/fake/model.onnx", device="cpu")

        assert captured_providers[0] == ["CPUExecutionProvider"]

    def test_cuda_provider_first_when_device_is_cuda(self) -> None:
        captured_providers: list[list[str]] = []

        def _capture_session(path: str, providers: list[str]) -> MagicMock:
            captured_providers.append(providers)
            session = MagicMock()
            session.get_inputs.return_value = [MagicMock(name="images")]
            session.get_outputs.return_value = [
                MagicMock(shape=[1, 11, 8400])
            ]
            session.get_providers.return_value = providers
            return session

        from inference.detector import Detector

        with patch("onnxruntime.InferenceSession", side_effect=_capture_session):
            Detector(model_path="/fake/model.onnx", device="cuda")

        assert captured_providers[0][0] == "CUDAExecutionProvider"
