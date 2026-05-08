"""
Tests for Detector.

TODO: Implement the following test cases:

    test_detect_returns_tracked_objects:
        Mock onnxruntime.InferenceSession.run() to return synthetic YOLO output.
        Assert detect() returns list[TrackedObject] with correct labels and bboxes.

    test_detect_filters_low_confidence:
        Return detections below threshold (0.4) in mock output.
        Assert those detections are excluded from the result.

    test_preprocess_shape:
        Pass a 1080x1920x3 BGR frame to _preprocess().
        Assert output shape is (1, 3, 640, 640) float32, values in [0, 1].

    test_cuda_provider_selected_when_gpu_available:
        Mock onnxruntime.get_available_providers() to include 'CUDAExecutionProvider'.
        Assert Detector.__init__ passes CUDAExecutionProvider first.

    test_cpu_fallback:
        Initialize Detector with device='cpu'.
        Assert session is created with ['CPUExecutionProvider'] only.

Use pytest-mock to patch onnxruntime.InferenceSession.
"""
import pytest
