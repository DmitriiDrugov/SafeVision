"""
YOLOv8 Object Detector using ONNX Runtime.

TODO: Implement Detector class:

    class Detector:
        SUPPORTED_CLASSES = ["person", "helmet", "vest", "gloves", "mask",
                              "forklift", "vehicle"]

        def __init__(self, model_path: str, device: str = "cuda") -> None:
            '''
            Load ONNX model with OrtInferenceSession.
            Providers: ["CUDAExecutionProvider", "CPUExecutionProvider"]
            If device == "cpu": providers = ["CPUExecutionProvider"]
            '''

        def detect(self, frame: numpy.ndarray) -> list[TrackedObject]:
            '''
            Run inference on a single BGR frame (OpenCV convention).
            1. Preprocess: resize to model input size (e.g. 640x640), normalize [0,1]
            2. Run session.run(None, {input_name: blob})
            3. Postprocess: NMS, threshold at confidence >= 0.4
            4. Map class indices to SUPPORTED_CLASSES labels
            5. Return list[TrackedObject] (track_id=0 until Tracker assigns IDs)
            '''

        def _preprocess(self, frame: numpy.ndarray) -> numpy.ndarray:
            '''Resize, BGR->RGB, HWC->NCHW, normalize to [0, 1], float32.'''

        def _postprocess(
            self,
            outputs: list[numpy.ndarray],
            orig_shape: tuple[int, int],
        ) -> list[TrackedObject]:
            '''Apply NMS, scale boxes back to orig_shape pixel coords.'''

Prometheus metrics:
    - inference_latency_seconds{model}: Histogram
    - inference_detections_total{class_name}: Counter
"""
