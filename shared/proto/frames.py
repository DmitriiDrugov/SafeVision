from datetime import datetime

from pydantic import BaseModel


class FrameEvent(BaseModel):
    """Reference to a decoded video frame stored in shared memory.

    Published by Ingestion. Inference reads the raw pixel data from the
    shared memory block identified by shm_name at shm_offset.
    """

    camera_id: str
    frame_id: int
    timestamp: datetime
    shm_name: str
    shm_offset: int
    width: int
    height: int
    channels: int = 3
