from pydantic import BaseModel, Field


class Zone(BaseModel):
    id: str
    name: str
    polygon: list[tuple[float, float]] = Field(
        ...,
        description="List of (x, y) vertices in normalized coordinates [0.0, 1.0]",
        min_length=3,
    )


class Camera(BaseModel):
    id: str
    name: str
    rtsp_url: str
    zones: list[Zone] = Field(default_factory=list)
    enabled: bool = True
