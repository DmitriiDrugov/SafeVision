from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from shared.schemas.detection import DetectionPayload
from shared.schemas.rule import Severity


class ViolationEvent(BaseModel):
    event_id: UUID
    rule_name: str
    camera_id: str
    zone_id: str
    severity: Severity
    detected_at: datetime
    detection_payload: DetectionPayload
    trace_id: str
