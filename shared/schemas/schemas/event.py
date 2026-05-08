from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from schemas.detection import DetectionPayload
from schemas.rule import Channel, Severity


class ViolationEvent(BaseModel):
    event_id: UUID
    rule_name: str
    camera_id: str
    zone_id: str
    severity: Severity
    channel: Channel = Channel.dashboard
    detected_at: datetime
    detection_payload: DetectionPayload
    trace_id: str
