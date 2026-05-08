"""In-memory state for duration-based rule conditions.

Stores the first-seen timestamp for each (rule_name, track_id, zone_id) triple.
Single-consumer; no locking needed in the current architecture.
"""
from __future__ import annotations

from datetime import datetime


class RuleState:
    def __init__(self) -> None:
        # key: (rule_name, track_id, zone_id)  value: first_seen_at
        self._presence: dict[tuple[str, int, str], datetime] = {}

    def record_presence(
        self,
        rule_name: str,
        track_id: int,
        zone_id: str,
        ts: datetime,
    ) -> None:
        key = (rule_name, track_id, zone_id)
        if key not in self._presence:
            self._presence[key] = ts

    def get_presence_duration(
        self,
        rule_name: str,
        track_id: int,
        zone_id: str,
        now: datetime,
    ) -> float | None:
        first_seen = self._presence.get((rule_name, track_id, zone_id))
        if first_seen is None:
            return None
        return (now - first_seen).total_seconds()

    def clear_absence(self, rule_name: str, track_id: int, zone_id: str) -> None:
        self._presence.pop((rule_name, track_id, zone_id), None)

    def evict_stale(self, now: datetime, max_age_seconds: float = 300.0) -> None:
        stale = [
            k
            for k, first_seen in self._presence.items()
            if (now - first_seen).total_seconds() > max_age_seconds
        ]
        for k in stale:
            del self._presence[k]

    def __len__(self) -> int:
        return len(self._presence)
