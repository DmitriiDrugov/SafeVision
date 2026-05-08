"""
Rule Engine State — in-memory state for duration-based rule conditions.

TODO: Implement RuleState class:

    class RuleState:
        def __init__(self) -> None:
            # _presence: dict[(rule_name, track_id, zone_id), first_seen_at]
            ...

        def record_presence(
            self,
            rule_name: str,
            track_id: int,
            zone_id: str,
            ts: datetime,
        ) -> None:
            '''
            Record that track_id is present in zone_id for rule_name at time ts.
            If already recorded, keep the original first_seen_at (do not update).
            '''

        def get_presence_duration(
            self,
            rule_name: str,
            track_id: int,
            zone_id: str,
            now: datetime,
        ) -> float | None:
            '''
            Return seconds since first_seen_at, or None if no record exists.
            '''

        def clear_absence(
            self,
            rule_name: str,
            track_id: int,
            zone_id: str,
        ) -> None:
            '''
            Remove presence record. Called when object leaves zone.
            '''

        def evict_stale(self, now: datetime, max_age_seconds: float = 300.0) -> None:
            '''
            Delete entries older than max_age_seconds.
            Called periodically (e.g. every 60s) to prevent unbounded growth.
            '''

Thread safety note:
    RuleState is only accessed from the main event loop (single consumer).
    No locking is required for the current single-consumer architecture.
    If Rule Engine is scaled to multiple consumers, add threading.Lock here.
"""
