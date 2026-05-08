"""MinIO object-storage client for incident evidence clips.

The MinIO SDK is synchronous; all blocking calls are wrapped with
asyncio.get_event_loop().run_in_executor so the event loop is never blocked.

Bucket lifecycle: clips under incidents/ expire after CLIP_RETENTION_DAYS
(default 90) so storage does not grow unbounded.
"""
from __future__ import annotations

import asyncio
import os
from datetime import timedelta
from functools import partial

import structlog
from minio import Minio
from minio.error import S3Error

logger = structlog.get_logger(__name__)

_PRESIGN_EXPIRY = timedelta(days=7)
_CLIP_RETENTION_DAYS = int(os.environ.get("CLIP_RETENTION_DAYS", "90"))


class IncidentStorage:
    def __init__(self) -> None:
        endpoint = os.environ.get("MINIO_ENDPOINT", "minio:9000")
        access_key = os.environ.get("MINIO_ACCESS_KEY", "minioadmin")
        secret_key = os.environ.get("MINIO_SECRET_KEY", "changeme123")
        use_ssl = os.environ.get("MINIO_USE_SSL", "false").lower() == "true"

        self._client = Minio(
            endpoint, access_key=access_key, secret_key=secret_key, secure=use_ssl
        )
        self._bucket = os.environ.get("MINIO_BUCKET_INCIDENTS", "incidents")
        self._log = logger.bind(bucket=self._bucket)

    async def ensure_bucket(self) -> None:
        """Create the incidents bucket if it does not already exist."""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._ensure_bucket_sync)

    def _ensure_bucket_sync(self) -> None:
        try:
            if not self._client.bucket_exists(self._bucket):
                self._client.make_bucket(self._bucket)
                self._log.info("storage.bucket_created")
        except S3Error as exc:
            self._log.error("storage.bucket_error", error=str(exc))
            raise
        self._set_lifecycle_sync()

    def _set_lifecycle_sync(self) -> None:
        """Apply (or refresh) a lifecycle rule that expires clips after CLIP_RETENTION_DAYS."""
        from minio.commonconfig import ENABLED, Filter
        from minio.lifecycleconfig import Expiration, LifecycleConfig, Rule

        config = LifecycleConfig(
            [
                Rule(
                    ENABLED,
                    rule_filter=Filter(prefix="incidents/"),
                    rule_id="expire-clips",
                    expiration=Expiration(days=_CLIP_RETENTION_DAYS),
                )
            ]
        )
        try:
            self._client.set_bucket_lifecycle(self._bucket, config)
            self._log.info("storage.lifecycle_set", expire_days=_CLIP_RETENTION_DAYS)
        except S3Error as exc:
            # Non-fatal — clips will still upload; operator can set lifecycle manually.
            self._log.warning("storage.lifecycle_error", error=str(exc))

    async def upload_clip(
        self,
        incident_id: str,
        clip_data: bytes,
        content_type: str = "video/mp4",
    ) -> str:
        """Upload evidence clip; return presigned GET URL."""
        key = f"incidents/{incident_id}/clip.mp4"
        loop = asyncio.get_event_loop()
        import io

        await loop.run_in_executor(
            None,
            partial(
                self._client.put_object,
                self._bucket,
                key,
                io.BytesIO(clip_data),
                len(clip_data),
                content_type=content_type,
            ),
        )
        return await self.get_presigned_url(incident_id)

    async def get_presigned_url(self, incident_id: str) -> str:
        key = f"incidents/{incident_id}/clip.mp4"
        loop = asyncio.get_event_loop()
        url: str = await loop.run_in_executor(
            None,
            partial(
                self._client.presigned_get_object,
                self._bucket,
                key,
                expires=_PRESIGN_EXPIRY,
            ),
        )
        return url

    async def delete_clip(self, incident_id: str) -> None:
        key = f"incidents/{incident_id}/clip.mp4"
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None, partial(self._client.remove_object, self._bucket, key)
        )
        self._log.info("storage.clip_deleted", incident_id=incident_id)
