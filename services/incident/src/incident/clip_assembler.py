"""Evidence clip assembly.

Waits for post-event frames to be written by the Ingestion service, then
collects the JPEG files from the shared frame-archive volume, encodes them
into an MP4 clip using ffmpeg, uploads the result to MinIO, and returns a
presigned URL.

The frame-archive volume must be mounted at the same path (FRAME_ARCHIVE_DIR)
in both the Ingestion and Incident containers.
"""
from __future__ import annotations

import asyncio
import os
import tempfile
from datetime import UTC, datetime
from pathlib import Path

import structlog

from .storage import IncidentStorage

logger = structlog.get_logger(__name__)

PRE_SEC = 10.0
POST_SEC = 10.0
ARCHIVE_ROOT = Path(os.environ.get("FRAME_ARCHIVE_DIR", "/data/frame-archive"))
CLIP_FPS = 5


class ClipAssembler:
    def __init__(self, storage: IncidentStorage) -> None:
        self._storage = storage

    async def assemble_and_upload(
        self,
        incident_id: str,
        camera_id: str,
        detected_at: datetime,
    ) -> str | None:
        """Assemble a clip and upload it.  Returns a presigned URL or None on failure."""
        event_ts = detected_at.timestamp()

        # Wait until the post-event window has elapsed so those frames are on disk
        wait = max(0.0, (event_ts + POST_SEC) - datetime.now(tz=UTC).timestamp())
        if wait > 0:
            await asyncio.sleep(wait)

        url = await asyncio.get_event_loop().run_in_executor(
            None, self._assemble_sync, incident_id, camera_id, event_ts
        )
        if url is not None:
            return url

        # If synchronous assembly failed, try async subprocess path directly
        return await self._assemble_async(incident_id, camera_id, event_ts)

    def _assemble_sync(
        self, incident_id: str, camera_id: str, event_ts: float
    ) -> str | None:
        """Blocking: collect frames, run ffmpeg, return None (async upload handled separately)."""
        return None  # delegate to _assemble_async for subprocess + upload

    async def _assemble_async(
        self, incident_id: str, camera_id: str, event_ts: float
    ) -> str | None:
        cam_dir = ARCHIVE_ROOT / camera_id
        if not cam_dir.exists():
            logger.warning("clip.archive_missing", camera_id=camera_id)
            return None

        window_start_ms = int((event_ts - PRE_SEC) * 1000)
        window_end_ms = int((event_ts + POST_SEC) * 1000)

        jpgs = sorted(
            (
                p
                for p in cam_dir.glob("*.jpg")
                if window_start_ms <= _stem_int(p) <= window_end_ms
            ),
            key=_stem_int,
        )

        if len(jpgs) < 2:
            logger.warning(
                "clip.insufficient_frames",
                incident_id=incident_id,
                count=len(jpgs),
            )
            return None

        with tempfile.TemporaryDirectory() as tmpdir:
            filelist = Path(tmpdir) / "frames.txt"
            out_path = Path(tmpdir) / "clip.mp4"
            frame_dur = f"{1.0 / CLIP_FPS:.4f}"

            with filelist.open("w") as fh:
                for jpg in jpgs:
                    fh.write(f"file '{jpg}'\nduration {frame_dur}\n")
                fh.write(f"file '{jpgs[-1]}'\n")  # repeat last to avoid ffmpeg EOF issue

            proc = await asyncio.create_subprocess_exec(
                "ffmpeg", "-y",
                "-f", "concat", "-safe", "0", "-i", str(filelist),
                "-vf", f"fps={CLIP_FPS}",
                "-c:v", "libx264", "-preset", "fast", "-crf", "28",
                "-movflags", "+faststart",
                str(out_path),
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await proc.communicate()

            if proc.returncode != 0:
                logger.error(
                    "clip.ffmpeg_error",
                    incident_id=incident_id,
                    stderr=stderr.decode(errors="replace")[-400:],
                )
                return None

            clip_bytes = out_path.read_bytes()

        try:
            url = await self._storage.upload_clip(incident_id, clip_bytes)
            logger.info("clip.uploaded", incident_id=incident_id, size_kb=len(clip_bytes) // 1024)
            return url
        except Exception as exc:
            logger.error("clip.upload_failed", incident_id=incident_id, error=str(exc))
            return None


def _stem_int(p: Path) -> int:
    try:
        return int(p.stem)
    except ValueError:
        return 0
