"""
Multi-Object Tracker wrapping ByteTrack via Ultralytics.

TODO: Implement Tracker class:

    class Tracker:
        def __init__(self, tracker_config: str = "bytetrack.yaml") -> None:
            '''
            Initialize one Ultralytics BYTETracker per camera_id (lazily).
            tracker_config path is relative to the ultralytics config directory.
            '''

        def update(
            self,
            detections: list[TrackedObject],
            frame: numpy.ndarray,
            camera_id: str,
        ) -> list[TrackedObject]:
            '''
            Pass detections to the per-camera ByteTrack instance.
            Returns same objects with track_id field populated.
            Lost tracks (not matched) are excluded from output.
            '''

        def _get_tracker(self, camera_id: str) -> BYTETracker:
            '''Lazily instantiate and cache one tracker per camera.'''

State note:
    ByteTrack state is in-memory per Tracker instance. If the Inference
    Service restarts, all track IDs reset to 1. This is acceptable because
    track IDs are ephemeral (used only within the Rule Engine for duration
    counting); persistent incident IDs come from the Incident Service.
"""
