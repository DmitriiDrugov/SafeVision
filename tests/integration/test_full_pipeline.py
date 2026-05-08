"""End-to-end pipeline integration tests.

Covers the two stream hops that the existing unit tests do NOT exercise:

  Hop 1 — Rule Engine:
    DetectionStreamEvent → XADD → XREADGROUP → evaluate → XADD ViolationStreamEvent

  Hop 2 — Incident Service:
    ViolationStreamEvent → XADD → XREADGROUP → persist → IncidentModel row in DB

The helpers _rule_engine_batch() and _incident_batch() each perform one complete
XREADGROUP → process → XACK cycle, mirroring the hot-path inside each service's
_stream_consumer() function without running the infinite while-True loop.

All streams use the 'test:' prefix so the conftest autouse cleanup handles teardown.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncIterator

import pytest
import pytest_asyncio
import redis.asyncio as aioredis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from proto.detections import DetectionStreamEvent
from proto.violations import ViolationStreamEvent
from rule_engine.evaluator import RuleEvaluator
from rule_engine.loader import RuleLoader
from rule_engine.state import RuleState
from schemas.detection import BoundingBox, DetectionPayload, TrackedObject
from schemas.event import ViolationEvent
from schemas.rule import Rule, Severity

from incident.db.models import Base, IncidentModel

# Mirrors incident.main._violation_to_incident — kept here to avoid importing
# the full service entrypoint (which pulls in JWT/MinIO at module level).
# Uses mode="json" so datetimes are ISO strings, compatible with SQLite's JSON column.
def _violation_to_incident(v: ViolationEvent) -> IncidentModel:
    return IncidentModel(
        rule_id=v.rule_name,
        camera_id=v.camera_id,
        zone_id=v.zone_id,
        severity=v.severity.value,
        status="open",
        detection_payload=v.detection_payload.model_dump(mode="json"),
        detected_at=v.detected_at,
    )

# ── Test stream / group names ─────────────────────────────────────────────
# 'test:' prefix → conftest autouse fixture flushes them after each test.

_DETECT_STREAM = "test:detections.frame"
_VIOLATION_STREAM = "test:events.violation"
_RE_GROUP = "test:rule-engine-cg"
_INC_GROUP = "test:incident-cg"

# ── Rule YAML fixtures ─────────────────────────────────────────────────────

_HELMET_RULE_YAML = """\
rule:
  name: no_helmet_zone_a
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

_FORKLIFT_RULE_YAML = """\
rule:
  name: forklift_in_safe_zone
  zone: safe_zone
  condition:
    object: forklift
  action:
    type: alert
    severity: medium
    channel: dashboard
  enabled: true
"""

_DISABLED_RULE_YAML = """\
rule:
  name: disabled_helmet_rule
  zone: forklift_zone
  condition:
    object: person
    missing_ppe: helmet
  action:
    type: alert
    severity: high
    channel: dashboard
  enabled: false
"""

# ── Shared fixtures ────────────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def db_session_factory() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    """In-memory SQLite engine with all Incident Service tables created."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    yield factory
    await engine.dispose()


@pytest.fixture()
def rules_dir(tmp_path: Path) -> Path:
    (tmp_path / "helmet.yaml").write_text(_HELMET_RULE_YAML)
    return tmp_path


@pytest.fixture()
def multi_rules_dir(tmp_path: Path) -> Path:
    (tmp_path / "helmet.yaml").write_text(_HELMET_RULE_YAML)
    (tmp_path / "forklift.yaml").write_text(_FORKLIFT_RULE_YAML)
    return tmp_path


# ── Pipeline helper functions ──────────────────────────────────────────────


async def _setup_group(
    redis_client: aioredis.Redis,
    stream: str,
    group: str,
) -> None:
    """Create a consumer group that reads from position 0 (includes existing messages)."""
    try:
        await redis_client.xgroup_create(stream, group, id="0", mkstream=True)
    except aioredis.ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise


async def _rule_engine_batch(
    redis_client: aioredis.Redis,
    evaluator: RuleEvaluator,
    rules: list[Rule],
    stream_in: str = _DETECT_STREAM,
    stream_out: str = _VIOLATION_STREAM,
    group: str = _RE_GROUP,
) -> int:
    """One XREADGROUP → evaluate → XADD cycle. Returns number of violations published."""
    messages = await redis_client.xreadgroup(
        groupname=group,
        consumername="test-rule-engine",
        streams={stream_in: ">"},
        count=100,
        block=500,
    )
    published = 0
    if not messages:
        return 0
    for _stream, entries in messages:
        for entry_id, fields in entries:
            event = DetectionStreamEvent.model_validate_json(fields["data"])
            for violation in evaluator.evaluate(rules, event):
                await redis_client.xadd(
                    stream_out,
                    {"data": ViolationStreamEvent(payload=violation).model_dump_json()},
                    maxlen=1_000,
                )
                published += 1
            await redis_client.xack(stream_in, group, entry_id)
    return published


async def _incident_batch(
    redis_client: aioredis.Redis,
    session_factory: async_sessionmaker[AsyncSession],
    stream_in: str = _VIOLATION_STREAM,
    group: str = _INC_GROUP,
) -> list[IncidentModel]:
    """One XREADGROUP → persist cycle. Returns the created IncidentModel rows."""
    messages = await redis_client.xreadgroup(
        groupname=group,
        consumername="test-incident",
        streams={stream_in: ">"},
        count=100,
        block=500,
    )
    created: list[IncidentModel] = []
    if not messages:
        return created
    for _stream, entries in messages:
        for entry_id, fields in entries:
            stream_event = ViolationStreamEvent.model_validate_json(fields["data"])
            row = _violation_to_incident(stream_event.payload)
            async with session_factory() as db:
                db.add(row)
                await db.commit()
                await db.refresh(row)
            created.append(row)
            await redis_client.xack(stream_in, group, entry_id)
    return created


def _make_detection(
    camera_id: str = "cam01",
    zone: str = "forklift_zone",
    class_name: str = "person",
    missing_helmet: bool = True,
    track_id: int = 1,
    ts: datetime | None = None,
) -> DetectionStreamEvent:
    attrs = {"ppe": "no_helmet"} if missing_helmet else {"ppe": "helmet"}
    return DetectionStreamEvent(
        payload=DetectionPayload(
            camera_id=camera_id,
            frame_id=track_id,
            timestamp=ts or datetime.now(tz=timezone.utc),
            objects=[
                TrackedObject(
                    track_id=track_id,
                    class_name=class_name,
                    confidence=0.92,
                    bbox=BoundingBox(x1=10, y1=10, x2=100, y2=200),
                    zone_ids=[zone],
                    attributes=attrs,
                )
            ],
        ),
        trace_id=f"trace-{track_id}",
    )


def _make_violation(
    rule_name: str = "no_helmet_zone_a",
    camera_id: str = "cam01",
    zone_id: str = "forklift_zone",
    severity: Severity = Severity.high,
) -> ViolationStreamEvent:
    v = ViolationEvent(
        event_id=uuid.uuid4(),
        rule_name=rule_name,
        camera_id=camera_id,
        zone_id=zone_id,
        severity=severity,
        detected_at=datetime.now(tz=timezone.utc),
        detection_payload=DetectionPayload(
            camera_id=camera_id,
            frame_id=1,
            timestamp=datetime.now(tz=timezone.utc),
            objects=[],
        ),
        trace_id="test-trace",
    )
    return ViolationStreamEvent(payload=v)


# ── Hop 1: Rule Engine pipeline ────────────────────────────────────────────


class TestRuleEnginePipeline:
    """Detection → rule evaluation → violation published to stream."""

    @pytest_asyncio.fixture(autouse=True)
    async def _groups(self, redis_client: aioredis.Redis) -> None:
        await _setup_group(redis_client, _DETECT_STREAM, _RE_GROUP)

    @pytest.mark.asyncio()
    async def test_violation_emitted_for_matching_detection(
        self, redis_client: aioredis.Redis, rules_dir: Path
    ) -> None:
        rules = RuleLoader(rules_dir).load_all()
        evaluator = RuleEvaluator(RuleState())

        await redis_client.xadd(
            _DETECT_STREAM, {"data": _make_detection(missing_helmet=True).model_dump_json()}
        )

        published = await _rule_engine_batch(redis_client, evaluator, rules)

        assert published == 1
        msgs = await redis_client.xrange(_VIOLATION_STREAM, count=10)
        assert len(msgs) == 1
        v = ViolationStreamEvent.model_validate_json(msgs[0][1]["data"])
        assert v.payload.rule_name == "no_helmet_zone_a"
        assert v.payload.camera_id == "cam01"
        assert v.payload.zone_id == "forklift_zone"
        assert v.payload.severity.value == "high"
        assert v.payload.trace_id == "trace-1"

    @pytest.mark.asyncio()
    async def test_no_violation_when_ppe_worn(
        self, redis_client: aioredis.Redis, rules_dir: Path
    ) -> None:
        rules = RuleLoader(rules_dir).load_all()
        evaluator = RuleEvaluator(RuleState())

        await redis_client.xadd(
            _DETECT_STREAM, {"data": _make_detection(missing_helmet=False).model_dump_json()}
        )

        published = await _rule_engine_batch(redis_client, evaluator, rules)

        assert published == 0
        assert await redis_client.xlen(_VIOLATION_STREAM) == 0

    @pytest.mark.asyncio()
    async def test_disabled_rule_produces_no_violation(
        self, redis_client: aioredis.Redis, tmp_path: Path
    ) -> None:
        (tmp_path / "disabled.yaml").write_text(_DISABLED_RULE_YAML)
        rules = RuleLoader(tmp_path).load_all()
        evaluator = RuleEvaluator(RuleState())

        await redis_client.xadd(
            _DETECT_STREAM, {"data": _make_detection(missing_helmet=True).model_dump_json()}
        )

        published = await _rule_engine_batch(redis_client, evaluator, rules)
        assert published == 0

    @pytest.mark.asyncio()
    async def test_multiple_detections_processed_in_one_batch(
        self, redis_client: aioredis.Redis, rules_dir: Path
    ) -> None:
        """Three frames with violations → three entries in the violation stream."""
        rules = RuleLoader(rules_dir).load_all()
        evaluator = RuleEvaluator(RuleState())

        for i in range(1, 4):
            await redis_client.xadd(
                _DETECT_STREAM,
                {"data": _make_detection(missing_helmet=True, track_id=i).model_dump_json()},
            )

        published = await _rule_engine_batch(redis_client, evaluator, rules)

        assert published == 3
        assert await redis_client.xlen(_VIOLATION_STREAM) == 3

    @pytest.mark.asyncio()
    async def test_detection_messages_acked_after_batch(
        self, redis_client: aioredis.Redis, rules_dir: Path
    ) -> None:
        """After processing, the detection stream PEL must be empty."""
        rules = RuleLoader(rules_dir).load_all()
        evaluator = RuleEvaluator(RuleState())

        for i in range(1, 3):
            await redis_client.xadd(
                _DETECT_STREAM,
                {"data": _make_detection(missing_helmet=True, track_id=i).model_dump_json()},
            )

        await _rule_engine_batch(redis_client, evaluator, rules)

        pending = await redis_client.xpending(_DETECT_STREAM, _RE_GROUP)
        assert pending["pending"] == 0

    @pytest.mark.asyncio()
    async def test_non_matching_detection_still_acked(
        self, redis_client: aioredis.Redis, rules_dir: Path
    ) -> None:
        """A detection that produces no violation must still be acked — no PEL leak."""
        rules = RuleLoader(rules_dir).load_all()
        evaluator = RuleEvaluator(RuleState())

        # Camera in a different zone — won't match the rule
        event = _make_detection(missing_helmet=True, zone="outside_zone")
        await redis_client.xadd(_DETECT_STREAM, {"data": event.model_dump_json()})

        published = await _rule_engine_batch(redis_client, evaluator, rules)
        assert published == 0

        pending = await redis_client.xpending(_DETECT_STREAM, _RE_GROUP)
        assert pending["pending"] == 0

    @pytest.mark.asyncio()
    async def test_multiple_rules_fire_independently(
        self, redis_client: aioredis.Redis, multi_rules_dir: Path
    ) -> None:
        """A frame with both a person (no helmet) and a forklift fires two violations."""
        rules = RuleLoader(multi_rules_dir).load_all()
        assert len(rules) == 2
        evaluator = RuleEvaluator(RuleState())

        # Frame with both person and forklift
        payload = DetectionPayload(
            camera_id="cam01",
            frame_id=1,
            timestamp=datetime.now(tz=timezone.utc),
            objects=[
                TrackedObject(
                    track_id=1, class_name="person", confidence=0.9,
                    bbox=BoundingBox(x1=10, y1=10, x2=100, y2=200),
                    zone_ids=["forklift_zone"],
                    attributes={"ppe": "no_helmet"},
                ),
                TrackedObject(
                    track_id=2, class_name="forklift", confidence=0.95,
                    bbox=BoundingBox(x1=200, y1=200, x2=400, y2=400),
                    zone_ids=["safe_zone"],
                    attributes={},
                ),
            ],
        )
        event = DetectionStreamEvent(payload=payload, trace_id="multi-rule-trace")
        await redis_client.xadd(_DETECT_STREAM, {"data": event.model_dump_json()})

        published = await _rule_engine_batch(redis_client, evaluator, rules)

        assert published == 2
        msgs = await redis_client.xrange(_VIOLATION_STREAM, count=10)
        rule_names = {
            ViolationStreamEvent.model_validate_json(m[1]["data"]).payload.rule_name
            for m in msgs
        }
        assert rule_names == {"no_helmet_zone_a", "forklift_in_safe_zone"}


# ── Hop 2: Incident Service pipeline ──────────────────────────────────────


class TestIncidentPipeline:
    """Violation stream → incident row persisted in DB."""

    @pytest_asyncio.fixture(autouse=True)
    async def _groups(self, redis_client: aioredis.Redis) -> None:
        await _setup_group(redis_client, _VIOLATION_STREAM, _INC_GROUP)

    @pytest.mark.asyncio()
    async def test_incident_created_from_violation(
        self,
        redis_client: aioredis.Redis,
        db_session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        stream_event = _make_violation(
            rule_name="no_helmet_zone_a",
            camera_id="cam42",
            zone_id="forklift_zone",
            severity=Severity.high,
        )
        await redis_client.xadd(_VIOLATION_STREAM, {"data": stream_event.model_dump_json()})

        incidents = await _incident_batch(redis_client, db_session_factory)
        assert len(incidents) == 1

    @pytest.mark.asyncio()
    async def test_incident_fields_match_violation_payload(
        self,
        redis_client: aioredis.Redis,
        db_session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        stream_event = _make_violation(
            rule_name="forklift_in_safe_zone",
            camera_id="cam99",
            zone_id="safe_zone",
            severity=Severity.medium,
        )
        await redis_client.xadd(_VIOLATION_STREAM, {"data": stream_event.model_dump_json()})

        incidents = await _incident_batch(redis_client, db_session_factory)
        row = incidents[0]

        assert row.rule_id == "forklift_in_safe_zone"
        assert row.camera_id == "cam99"
        assert row.zone_id == "safe_zone"
        assert row.severity == "medium"
        assert row.status == "open"
        assert row.acknowledged_by is None
        assert row.clip_url is None
        assert row.id is not None

    @pytest.mark.asyncio()
    async def test_violation_message_acked_after_incident_created(
        self,
        redis_client: aioredis.Redis,
        db_session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        await redis_client.xadd(
            _VIOLATION_STREAM, {"data": _make_violation().model_dump_json()}
        )

        await _incident_batch(redis_client, db_session_factory)

        pending = await redis_client.xpending(_VIOLATION_STREAM, _INC_GROUP)
        assert pending["pending"] == 0

    @pytest.mark.asyncio()
    async def test_multiple_violations_create_multiple_incidents(
        self,
        redis_client: aioredis.Redis,
        db_session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        for sev in [Severity.low, Severity.medium, Severity.high, Severity.critical]:
            await redis_client.xadd(
                _VIOLATION_STREAM,
                {"data": _make_violation(severity=sev).model_dump_json()},
            )

        incidents = await _incident_batch(redis_client, db_session_factory)
        assert len(incidents) == 4

        async with db_session_factory() as db:
            result = await db.execute(select(IncidentModel))
            rows = result.scalars().all()
        assert len(rows) == 4
        severities = {r.severity for r in rows}
        assert severities == {"low", "medium", "high", "critical"}

    @pytest.mark.asyncio()
    async def test_empty_stream_returns_no_incidents(
        self,
        redis_client: aioredis.Redis,
        db_session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """Consumer on an empty stream should return gracefully."""
        incidents = await _incident_batch(redis_client, db_session_factory)
        assert incidents == []


# ── Full pipeline: both hops chained ─────────────────────────────────────


class TestFullPipeline:
    """Detection → rule evaluation → violation → incident row (both hops)."""

    @pytest_asyncio.fixture(autouse=True)
    async def _groups(self, redis_client: aioredis.Redis) -> None:
        await _setup_group(redis_client, _DETECT_STREAM, _RE_GROUP)
        await _setup_group(redis_client, _VIOLATION_STREAM, _INC_GROUP)

    @pytest.mark.asyncio()
    async def test_detection_to_incident_full_path(
        self,
        redis_client: aioredis.Redis,
        rules_dir: Path,
        db_session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """A detection with a missing helmet creates an open incident in the DB."""
        rules = RuleLoader(rules_dir).load_all()
        evaluator = RuleEvaluator(RuleState())

        await redis_client.xadd(
            _DETECT_STREAM,
            {"data": _make_detection(camera_id="cam05", missing_helmet=True).model_dump_json()},
        )

        # Hop 1: detection → violation
        violations_published = await _rule_engine_batch(redis_client, evaluator, rules)
        assert violations_published == 1

        # Hop 2: violation → incident
        incidents = await _incident_batch(redis_client, db_session_factory)
        assert len(incidents) == 1

        row = incidents[0]
        assert row.rule_id == "no_helmet_zone_a"
        assert row.camera_id == "cam05"
        assert row.severity == "high"
        assert row.status == "open"

    @pytest.mark.asyncio()
    async def test_ppe_worn_produces_no_incident(
        self,
        redis_client: aioredis.Redis,
        rules_dir: Path,
        db_session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """A worker wearing correct PPE must not produce an incident."""
        rules = RuleLoader(rules_dir).load_all()
        evaluator = RuleEvaluator(RuleState())

        await redis_client.xadd(
            _DETECT_STREAM,
            {"data": _make_detection(missing_helmet=False).model_dump_json()},
        )

        violations_published = await _rule_engine_batch(redis_client, evaluator, rules)
        assert violations_published == 0

        incidents = await _incident_batch(redis_client, db_session_factory)
        assert incidents == []

    @pytest.mark.asyncio()
    async def test_trace_id_propagated_through_pipeline(
        self,
        redis_client: aioredis.Redis,
        rules_dir: Path,
        db_session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """The trace_id from the detection event must survive both stream hops."""
        rules = RuleLoader(rules_dir).load_all()
        evaluator = RuleEvaluator(RuleState())

        event = _make_detection(missing_helmet=True, track_id=99)  # trace_id = "trace-99"
        await redis_client.xadd(_DETECT_STREAM, {"data": event.model_dump_json()})

        await _rule_engine_batch(redis_client, evaluator, rules)

        # Read violation and verify trace_id preserved
        msgs = await redis_client.xrange(_VIOLATION_STREAM, count=1)
        v = ViolationStreamEvent.model_validate_json(msgs[0][1]["data"])
        assert v.payload.trace_id == "trace-99"

    @pytest.mark.asyncio()
    async def test_both_streams_fully_acked_after_pipeline(
        self,
        redis_client: aioredis.Redis,
        rules_dir: Path,
        db_session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """No orphaned pending entries in either stream after full pipeline run."""
        rules = RuleLoader(rules_dir).load_all()
        evaluator = RuleEvaluator(RuleState())

        for i in range(1, 4):
            await redis_client.xadd(
                _DETECT_STREAM,
                {"data": _make_detection(missing_helmet=True, track_id=i).model_dump_json()},
            )

        await _rule_engine_batch(redis_client, evaluator, rules)
        await _incident_batch(redis_client, db_session_factory)

        detect_pending = await redis_client.xpending(_DETECT_STREAM, _RE_GROUP)
        violation_pending = await redis_client.xpending(_VIOLATION_STREAM, _INC_GROUP)
        assert detect_pending["pending"] == 0
        assert violation_pending["pending"] == 0
