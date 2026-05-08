"""Rule Engine Service — entry point.

Consumes 'detections.frame' Redis Stream, evaluates each DetectionStreamEvent
against loaded YAML rules, and publishes ViolationEvents to 'events.violation'.
Rules are hot-reloaded from RULES_DIR via watchdog without dropping messages.
"""
from __future__ import annotations

import asyncio
import logging
import os
import signal
import socket
import sys
import threading
from pathlib import Path

import redis.asyncio as aioredis
import structlog
from prometheus_client import start_http_server

from proto.detections import DetectionStreamEvent
from proto.violations import ViolationStreamEvent
from schemas.event import ViolationEvent

from .evaluator import RuleEvaluator
from .loader import RuleLoader
from .state import RuleState

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer() if sys.stderr.isatty() else structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)

logger = structlog.get_logger(__name__)

_STREAM_INPUT = "detections.frame"
_STREAM_OUTPUT = "events.violation"
_STREAM_OUTPUT_MAXLEN = 50_000
_CONSUMER_GROUP = "rule-engine-cg"
_CONSUMER_NAME = socket.gethostname()
_BLOCK_MS = 100
_BATCH_SIZE = 10
_EVICT_EVERY_N = 600  # evict stale presence state every N messages


async def _ensure_consumer_group(redis_client: aioredis.Redis) -> None:
    try:
        await redis_client.xgroup_create(
            _STREAM_INPUT, _CONSUMER_GROUP, id="$", mkstream=True
        )
        logger.info("consumer_group.created", group=_CONSUMER_GROUP)
    except aioredis.ResponseError as exc:
        if "BUSYGROUP" in str(exc):
            logger.info("consumer_group.already_exists", group=_CONSUMER_GROUP)
        else:
            raise


async def _publish_violation(
    redis_client: aioredis.Redis, violation: ViolationEvent
) -> None:
    event = ViolationStreamEvent(payload=violation)
    await redis_client.xadd(
        _STREAM_OUTPUT,
        {"data": event.model_dump_json()},
        maxlen=_STREAM_OUTPUT_MAXLEN,
        approximate=True,
    )


def _print_violation(v: ViolationEvent) -> None:
    print(
        f"[VIOLATION] rule={v.rule_name} camera={v.camera_id} "
        f"zone={v.zone_id} severity={v.severity.value} at={v.detected_at.isoformat()}"
    )


async def _main() -> None:
    rules_dir = Path(os.environ.get("RULES_DIR", "/etc/safevision/rules"))
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")
    metrics_port = int(os.environ.get("METRICS_PORT", "8003"))

    rules_dir.mkdir(parents=True, exist_ok=True)
    logger.info("rule_engine.starting", rules_dir=str(rules_dir), redis_url=redis_url)

    start_http_server(metrics_port)
    logger.info("metrics.started", port=metrics_port)

    loader = RuleLoader(rules_dir)
    state = RuleState()
    evaluator = RuleEvaluator(state)

    rules_lock = threading.RLock()
    current_rules = loader.load_all()

    def _on_rules_change() -> None:
        new_rules = loader.load_all()
        with rules_lock:
            nonlocal current_rules
            current_rules = new_rules

    loader.watch(_on_rules_change)

    redis_client = await aioredis.from_url(redis_url, decode_responses=True)
    await _ensure_consumer_group(redis_client)

    running = True
    loop = asyncio.get_running_loop()

    def _handle_sigterm(*_: object) -> None:
        nonlocal running
        logger.info("rule_engine.shutdown_requested")
        running = False

    loop.add_signal_handler(signal.SIGTERM, _handle_sigterm)
    loop.add_signal_handler(signal.SIGINT, _handle_sigterm)

    logger.info(
        "rule_engine.consuming",
        stream=_STREAM_INPUT,
        group=_CONSUMER_GROUP,
        rules=len(current_rules),
    )

    message_count = 0
    while running:
        messages = await redis_client.xreadgroup(
            groupname=_CONSUMER_GROUP,
            consumername=_CONSUMER_NAME,
            streams={_STREAM_INPUT: ">"},
            count=_BATCH_SIZE,
            block=_BLOCK_MS,
        )

        if not messages:
            continue

        for _stream, entries in messages:
            for entry_id, fields in entries:
                try:
                    event = DetectionStreamEvent.model_validate_json(fields["data"])

                    with rules_lock:
                        rules_snapshot = list(current_rules)

                    violations = evaluator.evaluate(rules_snapshot, event)

                    for v in violations:
                        await _publish_violation(redis_client, v)
                        _print_violation(v)

                except Exception as exc:
                    logger.error(
                        "rule_engine.frame_error",
                        entry_id=entry_id,
                        error=str(exc),
                        exc_info=True,
                    )
                finally:
                    await redis_client.xack(_STREAM_INPUT, _CONSUMER_GROUP, entry_id)

                message_count += 1
                if message_count % _EVICT_EVERY_N == 0:
                    from datetime import datetime, timezone

                    state.evict_stale(datetime.now(tz=timezone.utc))

    await redis_client.aclose()
    logger.info("rule_engine.stopped")


def main() -> None:
    asyncio.run(_main())


if __name__ == "__main__":
    main()
