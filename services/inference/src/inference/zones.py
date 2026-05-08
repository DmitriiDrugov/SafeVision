"""Zone assignment for detected objects.

Loads camera zone polygons from Redis (key: safevision:cameras) and assigns
each TrackedObject to the zones whose polygon contains the object's bbox centroid.

Coordinates are normalised [0.0, 1.0] relative to the frame dimensions.
Zone config is refreshed from Redis at most once every REFRESH_INTERVAL_S seconds
so that zone edits via the Config UI propagate within a minute without any
coupling between services.
"""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any

import structlog

logger = structlog.get_logger(__name__)

_CAMERA_CONFIG_KEY = "safevision:cameras"
REFRESH_INTERVAL_S = 60.0


class ZoneAssigner:
    def __init__(self, redis_client: Any) -> None:
        self._redis = redis_client
        # camera_id → list of {"id": str, "name": str, "polygon": [[x,y], ...]}
        self._zone_map: dict[str, list[dict[str, Any]]] = {}
        self._last_refresh: float = 0.0

    async def refresh_if_stale(self) -> None:
        if time.monotonic() - self._last_refresh < REFRESH_INTERVAL_S:
            return
        try:
            raw = await self._redis.get(_CAMERA_CONFIG_KEY)
            if raw:
                cameras: list[dict[str, Any]] = json.loads(raw)
                self._zone_map = {cam["id"]: cam.get("zones", []) for cam in cameras}
                logger.debug("zones.refreshed", camera_count=len(self._zone_map))
        except Exception as exc:
            logger.warning("zones.refresh_failed", error=str(exc))
        finally:
            self._last_refresh = time.monotonic()

    def assign(
        self,
        camera_id: str,
        cx: float,
        cy: float,
    ) -> list[str]:
        """Return IDs of all zones whose polygon contains the point (cx, cy)."""
        zones = self._zone_map.get(camera_id, [])
        return [z["id"] for z in zones if _point_in_polygon(cx, cy, z["polygon"])]


def _point_in_polygon(px: float, py: float, polygon: list[list[float]]) -> bool:
    """Ray-casting test: returns True if (px, py) is inside the polygon."""
    n = len(polygon)
    if n < 3:
        return False
    inside = False
    x0, y0 = polygon[0]
    for i in range(1, n + 1):
        x1, y1 = polygon[i % n]
        if ((y0 > py) != (y1 > py)) and (px < (x1 - x0) * (py - y0) / (y1 - y0) + x0):
            inside = not inside
        x0, y0 = x1, y1
    return inside
