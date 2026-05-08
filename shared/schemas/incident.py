from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel

from shared.schemas.rule import Severity


class IncidentStatus(str, Enum):
    open = "open"
    acknowledged = "acknowledged"
    resolved = "resolved"
    false_positive = "false_positive"


class Incident(BaseModel):
    id: UUID
    rule_id: str
    camera_id: str
    zone_id: str
    detected_at: datetime
    severity: Severity
    status: IncidentStatus
    acknowledged_by: str | None = None
    acknowledged_at: datetime | None = None
    clip_url: str | None = None
    detection_payload: dict
