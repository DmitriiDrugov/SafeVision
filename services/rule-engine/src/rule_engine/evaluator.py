"""Rule Evaluator — evaluates loaded rules against a DetectionStreamEvent.

PPE detection strategy
-----------------------
1. Attribute-based (future inference pipeline): TrackedObject.attributes["ppe"]
   is set to "no_helmet", "no_vest", etc. by the inference service when the
   object's PPE status is classified.

2. Spatial proximity (M1/M2 inference): if attributes is empty, check whether
   any PPE-class detection (e.g. class_name == "helmet") overlaps the person's
   bounding box via IoU. If none overlaps, the person is considered missing PPE.

Zone filtering
--------------
If obj.zone_ids is empty the object has not been zone-tagged (inference service
hasn't implemented zone assignment yet). In that case the zone condition is
skipped so M2 works with M1 inference output. Once zone assignment is wired up,
empty zone_ids will correctly mean "not in any zone".
"""
from __future__ import annotations

from datetime import datetime
from uuid import uuid4

import structlog
from prometheus_client import Counter

from proto.detections import DetectionStreamEvent
from schemas.detection import BoundingBox, TrackedObject
from schemas.event import ViolationEvent
from schemas.rule import Rule

from .state import RuleState

logger = structlog.get_logger(__name__)

_violations_total = Counter(
    "rule_engine_violations_total",
    "Total violations emitted",
    ["rule_name", "severity"],
)

_IOU_THRESHOLD = 0.10  # minimum IoU to consider a PPE object "worn" by a person


class RuleEvaluator:
    def __init__(self, state: RuleState) -> None:
        self._state = state
        self._log = logger.bind(component="evaluator")

    def evaluate(
        self,
        rules: list[Rule],
        event: DetectionStreamEvent,
    ) -> list[ViolationEvent]:
        """Return one ViolationEvent per triggered rule per frame."""
        results: list[ViolationEvent] = []
        all_objects = event.payload.objects
        ts = event.payload.timestamp

        for rule in rules:
            if not rule.enabled:
                continue

            candidates = self._filter_by_object_type(rule, all_objects)
            candidates = self._filter_by_zone(rule, candidates)

            if rule.condition.missing_ppe is not None:
                candidates = [
                    o for o in candidates if self._check_ppe(rule, o, all_objects)
                ]

            if rule.condition.action is not None:
                candidates = [
                    o for o in candidates if self._check_action(rule, o)
                ]

            # Record presence for duration tracking; clear stale entries
            self._record_presence(rule, candidates, ts)

            if rule.condition.duration_seconds is not None:
                candidates = [
                    o for o in candidates if self._check_duration(rule, o, ts)
                ]

            if not self._check_min_count(rule, candidates):
                continue

            if not candidates:
                continue

            violation = self._make_violation(rule, event, candidates, ts)
            results.append(violation)
            _violations_total.labels(
                rule_name=rule.name, severity=rule.action.severity.value
            ).inc()
            self._log.info(
                "violation.detected",
                rule=rule.name,
                camera_id=event.payload.camera_id,
                severity=rule.action.severity.value,
                objects=len(candidates),
            )

        return results

    # ── private helpers ────────────────────────────────────────────────────

    def _filter_by_object_type(
        self, rule: Rule, objects: list[TrackedObject]
    ) -> list[TrackedObject]:
        return [o for o in objects if o.class_name == rule.condition.object.value]

    def _filter_by_zone(
        self, rule: Rule, objects: list[TrackedObject]
    ) -> list[TrackedObject]:
        filtered = []
        for obj in objects:
            if not obj.zone_ids:
                # Zone not yet assigned; pass through (M2 compatibility)
                filtered.append(obj)
            elif rule.zone in obj.zone_ids:
                filtered.append(obj)
        return filtered

    def _check_ppe(
        self, rule: Rule, obj: TrackedObject, all_objects: list[TrackedObject]
    ) -> bool:
        """Return True when the object IS missing the required PPE."""
        ppe_type = rule.condition.missing_ppe
        assert ppe_type is not None  # caller guarantees this

        # Attribute-based check takes priority
        attr_value = obj.attributes.get("ppe")
        if attr_value is not None:
            return attr_value == f"no_{ppe_type.value}"

        # Spatial proximity: look for PPE-class objects overlapping this bbox
        for other in all_objects:
            if other.class_name == ppe_type.value:
                if _iou(obj.bbox, other.bbox) >= _IOU_THRESHOLD:
                    return False  # PPE found near this person
        return True

    def _check_action(self, rule: Rule, obj: TrackedObject) -> bool:
        action = obj.attributes.get("action")
        if action is None:
            return True  # not enough info — pass through
        return action == rule.condition.action.value

    def _check_duration(self, rule: Rule, obj: TrackedObject, now: datetime) -> bool:
        assert rule.condition.duration_seconds is not None
        zone_id = obj.zone_ids[0] if obj.zone_ids else rule.zone
        duration = self._state.get_presence_duration(
            rule.name, obj.track_id, zone_id, now
        )
        return duration is not None and duration >= rule.condition.duration_seconds

    def _check_min_count(self, rule: Rule, matching: list[TrackedObject]) -> bool:
        if rule.condition.min_count is None:
            return True
        return len(matching) >= rule.condition.min_count

    def _record_presence(
        self, rule: Rule, candidates: list[TrackedObject], ts: datetime
    ) -> None:
        for obj in candidates:
            zone_id = obj.zone_ids[0] if obj.zone_ids else rule.zone
            self._state.record_presence(rule.name, obj.track_id, zone_id, ts)

    def _make_violation(
        self,
        rule: Rule,
        event: DetectionStreamEvent,
        candidates: list[TrackedObject],
        ts: datetime,
    ) -> ViolationEvent:
        zone_id = candidates[0].zone_ids[0] if candidates[0].zone_ids else rule.zone
        return ViolationEvent(
            event_id=uuid4(),
            rule_name=rule.name,
            camera_id=event.payload.camera_id,
            zone_id=zone_id,
            severity=rule.action.severity,
            channel=rule.action.channel,
            detected_at=ts,
            detection_payload=event.payload,
            trace_id=event.trace_id,
        )


def _iou(a: BoundingBox, b: BoundingBox) -> float:
    ix1 = max(a.x1, b.x1)
    iy1 = max(a.y1, b.y1)
    ix2 = min(a.x2, b.x2)
    iy2 = min(a.y2, b.y2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    area_a = (a.x2 - a.x1) * (a.y2 - a.y1)
    area_b = (b.x2 - b.x1) * (b.y2 - b.y1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0
