import re
from enum import Enum

from pydantic import BaseModel, Field, field_validator


class ObjectType(str, Enum):
    person = "person"
    forklift = "forklift"
    vehicle = "vehicle"


class PPEType(str, Enum):
    helmet = "helmet"
    vest = "vest"
    gloves = "gloves"
    mask = "mask"


class ActionType(str, Enum):
    entering = "entering"
    exiting = "exiting"
    standing = "standing"
    moving = "moving"


class Severity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class RuleActionKind(str, Enum):
    alert = "alert"
    log = "log"
    block = "block"


class RuleCondition(BaseModel):
    object: ObjectType
    missing_ppe: PPEType | None = None
    action: ActionType | None = None
    duration_seconds: float | None = Field(default=None, gt=0)
    min_count: int | None = Field(default=None, ge=1)


class RuleAction(BaseModel):
    type: RuleActionKind
    severity: Severity


class Rule(BaseModel):
    name: str
    zone: str
    condition: RuleCondition
    action: RuleAction
    enabled: bool = True

    @field_validator("name")
    @classmethod
    def name_must_be_snake_case(cls, v: str) -> str:
        if not re.match(r"^[a-z][a-z0-9_]*$", v):
            raise ValueError("Rule name must be snake_case (lowercase letters, digits, underscores)")
        return v
