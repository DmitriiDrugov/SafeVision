from pydantic import BaseModel
from schemas.event import ViolationEvent

STREAM_NAME = "events.violation"


class ViolationStreamEvent(BaseModel):
    """Published to the Redis Stream 'events.violation' by the Rule Engine."""

    payload: ViolationEvent
