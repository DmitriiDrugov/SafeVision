"""JPEG ring-buffer archive for evidence clip assembly.

Frames are written as JPEG files to ARCHIVE_ROOT/<camera_id>/<timestamp_ms>.jpg.
A background coroutine deletes files older than RETENTION_SEC on a 30 s interval.

The archive root is controlled by the FRAME_ARCHIVE_DIR environment variable
(default: /data/frame-archive) which should be a shared volume also mounted
by the Incident Service.
"""
from __future__ import annotations

import asyncio
import os
import time
from pathlib import Path

import cv2
import numpy as np
import structlog

logger = structlog.get_logger(__name__)

RETENTION_SEC = float(os.environ.get("FRAME_ARCHIVE_RETENTION_SEC", "90"))
_ARCHIVE_ROOT = Path(os.environ.get("FRAME_ARCHIVE_DIR", "/data/frame-archive"))
_CLEANUP_INTERVAL_S = 30.0
_JPEG_QUALITY = 80


class FrameArchive:
    def __init__(self, root: Path = _ARCHIVE_ROOT) -> None:
        self._root = root

    def write(self, camera_id: str, timestamp_ms: int, frame_rgb: np.ndarray) -> None:
        """Encode frame as JPEG and persist to disk (blocking — call in executor)."""
        cam_dir = self._root / camera_id
        cam_dir.mkdir(parents=True, exist_ok=True)
        bgr = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
        ok, buf = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, _JPEG_QUALITY])
        if ok:
            (cam_dir / f"{timestamp_ms}.jpg").write_bytes(buf.tobytes())

    async def run_cleanup(self) -> None:
        """Background task: remove JPEG files older than RETENTION_SEC."""
        while True:
            try:
                await asyncio.sleep(_CLEANUP_INTERVAL_S)
                await asyncio.get_event_loop().run_in_executor(None, self._cleanup_sync)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.warning("frame_archive.cleanup_error", error=str(exc))

    def _cleanup_sync(self) -> None:
        cutoff_ms = int((time.time() - RETENTION_SEC) * 1000)
        if not self._root.exists():
            return
        removed = 0
        for cam_dir in self._root.iterdir():
            if not cam_dir.is_dir():
                continue
            for jpg in cam_dir.glob("*.jpg"):
                try:
                    if int(jpg.stem) < cutoff_ms:
                        jpg.unlink(missing_ok=True)
                        removed += 1
                except (ValueError, OSError):
                    pass
        if removed:
            logger.debug("frame_archive.cleaned", removed=removed)
