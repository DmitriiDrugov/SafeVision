from pydantic import BaseModel

from schemas.detection import DetectionPayload

STREAM_NAME = "detections.frame"


class DetectionStreamEvent(BaseModel):
    """Published to the Redis Stream 'detections.frame' by the Inference Service."""

    payload: DetectionPayload
    trace_id: str
