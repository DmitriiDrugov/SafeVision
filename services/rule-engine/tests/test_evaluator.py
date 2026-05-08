"""Unit tests for RuleEvaluator — the most critical test suite in the codebase."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import pytest

from proto.detections import DetectionStreamEvent
from rule_engine.evaluator import RuleEvaluator
from rule_engine.state import RuleState
from schemas.detection import BoundingBox, DetectionPayload, TrackedObject
from schemas.event import ViolationEvent
from schemas.rule import (
    ActionType,
    Channel,
    ObjectType,
    PPEType,
    Rule,
    RuleAction,
    RuleActionKind,
    RuleCondition,
    Severity,
)

_NOW = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
_CAMERA = "cam01"
_ZONE = "forklift_zone"


# ── factories ──────────────────────────────────────────────────────────────

def _bbox(x1: float = 10, y1: float = 10, x2: float = 50, y2: float = 100) -> BoundingBox:
    return BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2)


def _obj(
    class_name: str = "person",
    track_id: int = 1,
    zone_ids: list[str] | None = None,
    attributes: dict[str, str] | None = None,
    bbox: BoundingBox | None = None,
) -> TrackedObject:
    return TrackedObject(
        track_id=track_id,
        class_name=class_name,
        confidence=0.9,
        bbox=bbox or _bbox(),
        zone_ids=zone_ids if zone_ids is not None else [_ZONE],
        attributes=attributes or {},
    )


def _event(objects: list[TrackedObject], ts: datetime = _NOW) -> DetectionStreamEvent:
    return DetectionStreamEvent(
        payload=DetectionPayload(
            camera_id=_CAMERA,
            frame_id=1,
            timestamp=ts,
            objects=objects,
        ),
        trace_id="test-trace",
    )


def _rule(
    *,
    object_type: ObjectType = ObjectType.person,
    zone: str = _ZONE,
    missing_ppe: PPEType | None = None,
    action: ActionType | None = None,
    duration_seconds: float | None = None,
    min_count: int | None = None,
    enabled: bool = True,
    severity: Severity = Severity.high,
) -> Rule:
    return Rule(
        name="test_rule",
        zone=zone,
        condition=RuleCondition(
            object=object_type,
            missing_ppe=missing_ppe,
            action=action,
            duration_seconds=duration_seconds,
            min_count=min_count,
        ),
        action=RuleAction(
            type=RuleActionKind.alert,
            severity=severity,
            channel=Channel.dashboard,
        ),
        enabled=enabled,
    )


@pytest.fixture()
def evaluator() -> RuleEvaluator:
    return RuleEvaluator(RuleState())


# ── object type filtering ──────────────────────────────────────────────────

class TestObjectTypeFilter:
    def test_no_violation_when_no_matching_objects(self, evaluator: RuleEvaluator) -> None:
        rule = _rule(object_type=ObjectType.person)
        event = _event([_obj("forklift")])
        assert evaluator.evaluate([rule], event) == []

    def test_violation_when_matching_object_present(self, evaluator: RuleEvaluator) -> None:
        rule = _rule(object_type=ObjectType.person)
        event = _event([_obj("person")])
        violations = evaluator.evaluate([rule], event)
        assert len(violations) == 1

    def test_disabled_rule_not_evaluated(self, evaluator: RuleEvaluator) -> None:
        rule = _rule(enabled=False)
        event = _event([_obj("person")])
        assert evaluator.evaluate([rule], event) == []


# ── PPE checks ─────────────────────────────────────────────────────────────

class TestPPECheck:
    def test_violation_when_person_missing_helmet_via_attribute(
        self, evaluator: RuleEvaluator
    ) -> None:
        rule = _rule(missing_ppe=PPEType.helmet)
        person = _obj("person", attributes={"ppe": "no_helmet"})
        violations = evaluator.evaluate([rule], _event([person]))
        assert len(violations) == 1

    def test_no_violation_when_ppe_present_via_attribute(
        self, evaluator: RuleEvaluator
    ) -> None:
        rule = _rule(missing_ppe=PPEType.helmet)
        person = _obj("person", attributes={"ppe": "helmet"})
        assert evaluator.evaluate([rule], _event([person])) == []

    def test_violation_when_no_helmet_overlapping_person_spatial(
        self, evaluator: RuleEvaluator
    ) -> None:
        """No attributes set → spatial check: no nearby helmet → violation."""
        rule = _rule(missing_ppe=PPEType.helmet)
        # Helmet bbox far from person — no overlap
        person = _obj("person", bbox=_bbox(10, 10, 50, 100))
        helmet = _obj("helmet", bbox=_bbox(200, 200, 230, 230))
        violations = evaluator.evaluate([rule], _event([person, helmet]))
        assert len(violations) == 1

    def test_no_violation_when_helmet_overlaps_person_spatial(
        self, evaluator: RuleEvaluator
    ) -> None:
        """Helmet box overlaps person box → person IS wearing helmet."""
        rule = _rule(missing_ppe=PPEType.helmet)
        person = _obj("person", bbox=_bbox(10, 10, 100, 200))
        helmet = _obj("helmet", bbox=_bbox(20, 10, 80, 60))  # inside person bbox
        assert evaluator.evaluate([rule], _event([person, helmet])) == []


# ── duration checks ─────────────────────────────────────────────────────────

class TestDurationCheck:
    def test_no_violation_when_duration_not_met(self, evaluator: RuleEvaluator) -> None:
        rule = _rule(duration_seconds=5.0)
        person = _obj("person", track_id=42)
        ts = _NOW
        # First frame — presence just recorded; 0 s elapsed < 5 s
        assert evaluator.evaluate([rule], _event([person], ts=ts)) == []

    def test_violation_when_duration_met(self, evaluator: RuleEvaluator) -> None:
        rule = _rule(duration_seconds=5.0)
        person = _obj("person", track_id=42)
        ts0 = _NOW
        ts1 = _NOW + timedelta(seconds=6)

        evaluator.evaluate([rule], _event([person], ts=ts0))
        violations = evaluator.evaluate([rule], _event([person], ts=ts1))
        assert len(violations) == 1


# ── min_count checks ────────────────────────────────────────────────────────

class TestMinCountCheck:
    def test_no_violation_when_count_below_threshold(
        self, evaluator: RuleEvaluator
    ) -> None:
        rule = _rule(min_count=3)
        event = _event([_obj("person", track_id=1), _obj("person", track_id=2)])
        assert evaluator.evaluate([rule], event) == []

    def test_violation_when_count_meets_threshold(
        self, evaluator: RuleEvaluator
    ) -> None:
        rule = _rule(min_count=3)
        persons = [_obj("person", track_id=i) for i in range(3)]
        violations = evaluator.evaluate([rule], _event(persons))
        assert len(violations) == 1


# ── violation event fields ──────────────────────────────────────────────────

class TestViolationFields:
    def test_violation_event_has_correct_fields(self, evaluator: RuleEvaluator) -> None:
        rule = _rule(severity=Severity.critical, zone=_ZONE)
        person = _obj("person", zone_ids=[_ZONE])
        violations = evaluator.evaluate([rule], _event([person]))

        assert len(violations) == 1
        v = violations[0]
        assert v.rule_name == "test_rule"
        assert v.camera_id == _CAMERA
        assert v.zone_id == _ZONE
        assert v.severity == Severity.critical
        assert v.trace_id == "test-trace"
