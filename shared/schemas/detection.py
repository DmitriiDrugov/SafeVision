from datetime import datetime

from pydantic import BaseModel, Field


class BoundingBox(BaseModel):
    x1: float = Field(..., ge=0.0)
    y1: float = Field(..., ge=0.0)
    x2: float = Field(..., ge=0.0)
    y2: float = Field(..., ge=0.0)


class TrackedObject(BaseModel):
    track_id: int
    class_name: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    bbox: BoundingBox
    zone_ids: list[str] = Field(default_factory=list)


class DetectionPayload(BaseModel):
    camera_id: str
    frame_id: int
    timestamp: datetime
    objects: list[TrackedObject] = Field(default_factory=list)
