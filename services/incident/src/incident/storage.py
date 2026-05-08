"""
MinIO Storage Client for incident evidence clips.

TODO: Implement IncidentStorage class:

    class IncidentStorage:
        def __init__(self) -> None:
            '''
            Initialize Minio client from env vars:
                MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_USE_SSL
            Ensure bucket MINIO_BUCKET_INCIDENTS exists (create if missing).
            '''

        async def upload_clip(
            self,
            incident_id: str,
            clip_data: bytes,
            content_type: str = "video/mp4",
        ) -> str:
            '''
            Upload clip_data to MinIO.
            Object key: f"incidents/{incident_id}/clip.mp4"
            Returns presigned GET URL valid for 7 days.
            '''

        async def get_presigned_url(self, incident_id: str) -> str:
            '''
            Generate a fresh presigned GET URL for an existing clip.
            Expires in 7 days.
            '''

        async def delete_clip(self, incident_id: str) -> None:
            '''Delete the evidence clip (used when marking false_positive).'''

Note: MinIO client is synchronous; run blocking calls in asyncio.run_in_executor
to avoid blocking the event loop.
"""
