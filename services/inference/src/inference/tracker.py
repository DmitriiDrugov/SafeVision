"""Multi-object tracker wrapping Ultralytics ByteTrack.

Maintains one BYTETracker instance per camera so that track IDs are consistent
within each camera stream but isolated across cameras.
"""
from __future__ import annotations

import numpy as np
import structlog
from schemas.detection import TrackedObject

logger = structlog.get_logger(__name__)


def _make_tracker() -> object:
    from ultralytics.trackers.byte_tracker import BYTETracker
    from ultralytics.utils import IterableSimpleNamespace

    args = IterableSimpleNamespace(
        track_high_thresh=0.5,
        track_low_thresh=0.1,
        new_track_thresh=0.6,
        track_buffer=30,
        match_thresh=0.8,
        fuse_score=True,
    )
    return BYTETracker(args, frame_rate=5)


class _MockBoxes:
    """Duck-type wrapper to feed our detections into BYTETracker.update()."""

    __slots__ = ("xyxy", "conf", "cls")

    def __init__(
        self,
        xyxy: np.ndarray,
        conf: np.ndarray,
        cls: np.ndarray,
    ) -> None:
        import torch

        self.xyxy = torch.from_numpy(xyxy.astype(np.float32))
        self.conf = torch.from_numpy(conf.astype(np.float32))
        self.cls = torch.from_numpy(cls.astype(np.float32))


class _MockResults:
    __slots__ = ("boxes",)

    def __init__(
        self,
        xyxy: np.ndarray,
        conf: np.ndarray,
        cls: np.ndarray,
    ) -> None:
        self.boxes = _MockBoxes(xyxy, conf, cls)


class Tracker:
    def __init__(self) -> None:
        self._trackers: dict[str, object] = {}
        self._log = logger.bind(component="tracker")

    def update(
        self,
        detections: list[TrackedObject],
        frame: np.ndarray,
        camera_id: str,
    ) -> list[TrackedObject]:
        """Assign persistent track IDs to detections using ByteTrack.

        Returns the same objects with track_id populated; unmatched
        (lost) tracks are excluded.
        """
        if not detections:
            return []

        tracker = self._get_tracker(camera_id)

        xyxy = np.array(
            [[d.bbox.x1, d.bbox.y1, d.bbox.x2, d.bbox.y2] for d in detections],
            dtype=np.float32,
        )
        conf = np.array([d.confidence for d in detections], dtype=np.float32)
        # Use class index (0-based); map back after tracking
        cls_map = {d.class_name: i for i, d in enumerate(detections)}
        cls_arr = np.array([cls_map[d.class_name] for d in detections], dtype=np.float32)

        mock = _MockResults(xyxy, conf, cls_arr)

        try:
            tracks = tracker.update(mock, frame)  # type: ignore[attr-defined]
        except Exception as exc:
            self._log.warning("tracker.update_failed", camera_id=camera_id, error=str(exc))
            return detections  # fall back: return untracked detections

        if tracks is None or len(tracks) == 0:
            return []

        # tracks rows: [x1, y1, x2, y2, track_id, score, cls_id, ...]
        tracked: list[TrackedObject] = []
        for row in tracks:
            track_id = int(row[4])
            score = float(row[5])
            cls_idx = int(row[6]) if len(row) > 6 else 0

            # Map class index back to name from original detections
            class_name = (
                detections[cls_idx].class_name
                if cls_idx < len(detections)
                else "unknown"
            )

            # Find closest matching detection by bbox IoU
            t_x1, t_y1, t_x2, t_y2 = float(row[0]), float(row[1]), float(row[2]), float(row[3])
            match = next(
                (
                    d
                    for d in detections
                    if abs(d.bbox.x1 - t_x1) < 5 and abs(d.bbox.y1 - t_y1) < 5
                ),
                None,
            )
            if match is not None:
                class_name = match.class_name

            tracked.append(
                TrackedObject(
                    track_id=track_id,
                    class_name=class_name,
                    confidence=score,
                    bbox=detections[0].bbox.model_copy(
                        update={"x1": t_x1, "y1": t_y1, "x2": t_x2, "y2": t_y2}
                    ),
                    zone_ids=[],
                )
            )
        return tracked

    def _get_tracker(self, camera_id: str) -> object:
        if camera_id not in self._trackers:
            self._trackers[camera_id] = _make_tracker()
            self._log.info("tracker.created", camera_id=camera_id)
        return self._trackers[camera_id]
