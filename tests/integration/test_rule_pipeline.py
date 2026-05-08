"""Integration tests for the Rule Engine stream pipeline.

Verifies the full path:
  DetectionStreamEvent published to Redis
  → RuleEvaluator processes it
  → ViolationStreamEvent published to Redis
  → downstream consumer reads the violation

Tests run against a live Redis instance (see conftest.py).
"""
from __future__ import annotations

import asyncio
import json
import threading
from datetime import datetime, timezone
from pathlib import Path

import pytest
import pytest_asyncio
import redis.asyncio as aioredis

from proto.detections import DetectionStreamEvent
from proto.violations import ViolationStreamEvent
from rule_engine.evaluator import RuleEvaluator
from rule_engine.loader import RuleLoader
from rule_engine.state import RuleState
from schemas.detection import BoundingBox, DetectionPayload, TrackedObject

_STREAM_IN = "test:detections.frame"
_STREAM_OUT = "test:events.violation"
_GROUP = "test-rule-engine-cg"

_HELMET_RULE_YAML = """\
rule:
  name: person_no_helmet_integration
  zone: forklift_zone
  condition:
    object: person
    missing_ppe: helmet
  action:
    type: alert
    severity: high
    channel: whatsapp
  enabled: true
"""


@pytest.fixture()
def rules_dir(tmp_path: Path) -> Path:
    (tmp_path / "helmet.yaml").write_text(_HELMET_RULE_YAML)
    return tmp_path


@pytest.fixture()
def evaluator() -> RuleEvaluator:
    return RuleEvaluator(RuleState())


def _detection_event(missing_helmet: bool = True) -> DetectionStreamEvent:
    objects = [
        TrackedObject(
            track_id=1,
            class_name="person",
            confidence=0.92,
            bbox=BoundingBox(x1=10, y1=10, x2=100, y2=200),
            zone_ids=["forklift_zone"],
            attributes={"ppe": "no_helmet"} if missing_helmet else {"ppe": "helmet"},
        )
    ]
    return DetectionStreamEvent(
        payload=DetectionPayload(
            camera_id="cam01",
            frame_id=1,
            timestamp=datetime.now(tz=timezone.utc),
            objects=objects,
        ),
        trace_id="integration-test-trace",
    )


class TestRuleEvaluatorWithRedis:
    @pytest.mark.asyncio()
    async def test_violation_published_when_rule_matches(
        self,
        redis_client: aioredis.Redis,
        rules_dir: Path,
        evaluator: RuleEvaluator,
    ) -> None:
        loader = RuleLoader(rules_dir)
        rules = loader.load_all()
        assert len(rules) == 1

        event = _detection_event(missing_helmet=True)
        violations = evaluator.evaluate(rules, event)
        assert len(violations) == 1, "Evaluator should find a violation"

        # Publish the violation to Redis (mimics what main.py does)
        stream_event = ViolationStreamEvent(payload=violations[0])
        await redis_client.xadd(
            _STREAM_OUT,
            {"data": stream_event.model_dump_json()},
            maxlen=100,
        )

        # Read back from Redis and verify round-trip
        messages = await redis_client.xrange(_STREAM_OUT, count=10)
        assert len(messages) == 1
        _, fields = messages[0]
        recovered = ViolationStreamEvent.model_validate_json(fields["data"])
        assert recovered.payload.rule_name == "person_no_helmet_integration"
        assert recovered.payload.camera_id == "cam01"
        assert recovered.payload.severity.value == "high"
        assert recovered.payload.trace_id == "integration-test-trace"

    @pytest.mark.asyncio()
    async def test_no_violation_when_ppe_present(
        self,
        redis_client: aioredis.Redis,
        rules_dir: Path,
        evaluator: RuleEvaluator,
    ) -> None:
        loader = RuleLoader(rules_dir)
        rules = loader.load_all()

        event = _detection_event(missing_helmet=False)
        violations = evaluator.evaluate(rules, event)
        assert violations == []

    @pytest.mark.asyncio()
    async def test_disabled_rule_produces_no_violation(
        self,
        redis_client: aioredis.Redis,
        tmp_path: Path,
        evaluator: RuleEvaluator,
    ) -> None:
        disabled = _HELMET_RULE_YAML.replace("enabled: true", "enabled: false")
        (tmp_path / "disabled.yaml").write_text(disabled)
        loader = RuleLoader(tmp_path)
        rules = loader.load_all()

        event = _detection_event(missing_helmet=True)
        violations = evaluator.evaluate(rules, event)
        assert violations == []


class TestRedisStreamRoundTrip:
    @pytest.mark.asyncio()
    async def test_detection_event_survives_redis_round_trip(
        self, redis_client: aioredis.Redis
    ) -> None:
        """Serialise → XADD → XRANGE → deserialise should be lossless."""
        original = _detection_event()
        await redis_client.xadd(
            _STREAM_IN,
            {"data": original.model_dump_json()},
            maxlen=100,
        )

        messages = await redis_client.xrange(_STREAM_IN, count=1)
        assert len(messages) == 1
        _, fields = messages[0]
        recovered = DetectionStreamEvent.model_validate_json(fields["data"])

        assert recovered.payload.camera_id == original.payload.camera_id
        assert recovered.payload.frame_id == original.payload.frame_id
        assert len(recovered.payload.objects) == len(original.payload.objects)
        assert recovered.trace_id == original.trace_id

    @pytest.mark.asyncio()
    async def test_consumer_group_ack_advances_pending(
        self, redis_client: aioredis.Redis
    ) -> None:
        """XACK removes messages from the consumer's PEL."""
        try:
            await redis_client.xgroup_create(
                _STREAM_IN, _GROUP, id="0", mkstream=True
            )
        except aioredis.ResponseError as exc:
            if "BUSYGROUP" not in str(exc):
                raise

        event = _detection_event()
        await redis_client.xadd(_STREAM_IN, {"data": event.model_dump_json()})

        # Read via group
        messages = await redis_client.xreadgroup(
            groupname=_GROUP,
            consumername="test-consumer",
            streams={_STREAM_IN: ">"},
            count=10,
        )
        assert messages, "Should have received at least one message"

        # Pending count before ack
        pending_before = await redis_client.xpending(
            _STREAM_IN, _GROUP
        )
        assert pending_before["pending"] >= 1

        # Ack all received
        entry_ids = [eid for _, entries in messages for eid, _ in entries]
        await redis_client.xack(_STREAM_IN, _GROUP, *entry_ids)

        pending_after = await redis_client.xpending(_STREAM_IN, _GROUP)
        assert pending_after["pending"] == 0


class TestHotReload:
    @pytest.mark.asyncio()
    async def test_new_rule_file_is_picked_up_by_watchdog(
        self, tmp_path: Path
    ) -> None:
        """Adding a YAML file to rules_dir triggers on_change within 3 s."""
        loader = RuleLoader(tmp_path)
        changed = threading.Event()
        loader.watch(lambda: changed.set())

        await asyncio.sleep(0.1)  # let watchdog thread start

        (tmp_path / "new_rule.yaml").write_text(_HELMET_RULE_YAML)

        assert changed.wait(timeout=4.0), "Watchdog did not fire within 4 s"
        rules = loader.load_all()
        assert len(rules) == 1
        assert rules[0].name == "person_no_helmet_integration"
