"""Rule Engine Service — FastAPI app.

The Redis stream consumer runs as a lifespan background task.
REST endpoints expose rule CRUD so the Config UI can manage rules
without restarting the service.
"""
from __future__ import annotations

import asyncio
import logging
import os
import socket
import sys
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import redis.asyncio as aioredis
import structlog
import yaml
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from proto.detections import DetectionStreamEvent
from proto.otel import setup_otel
from proto.violations import ViolationStreamEvent
from pydantic import BaseModel, ValidationError
from schemas.event import ViolationEvent
from schemas.rule import Rule

from .auth import get_current_user
from .evaluator import RuleEvaluator
from .loader import RuleLoader
from .state import RuleState

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer()
        if sys.stderr.isatty()
        else structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)

logger = structlog.get_logger(__name__)

_STREAM_INPUT = "detections.frame"
_STREAM_OUTPUT = "events.violation"
_STREAM_MAXLEN = 50_000
_CONSUMER_GROUP = "rule-engine-cg"
_CONSUMER_NAME = socket.gethostname()
_BLOCK_MS = 100
_BATCH_SIZE = 10
_EVICT_EVERY_N = 600


async def _ensure_consumer_group(redis_client: aioredis.Redis) -> None:
    try:
        await redis_client.xgroup_create(
            _STREAM_INPUT, _CONSUMER_GROUP, id="$", mkstream=True
        )
    except aioredis.ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise


async def _stream_consumer(
    redis_client: aioredis.Redis,
    evaluator: RuleEvaluator,
    rules_lock: threading.RLock,
    rules_ref: list[list[Rule]],
) -> None:
    logger.info("rule_engine.consumer.started", stream=_STREAM_INPUT)
    message_count = 0
    state: RuleState = evaluator._state  # type: ignore[attr-defined]

    while True:
        try:
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
                            rules_snapshot = list(rules_ref[0])
                        violations = evaluator.evaluate(rules_snapshot, event)
                        for v in violations:
                            evt = ViolationStreamEvent(payload=v)
                            await redis_client.xadd(
                                _STREAM_OUTPUT,
                                {"data": evt.model_dump_json()},
                                maxlen=_STREAM_MAXLEN,
                                approximate=True,
                            )
                            _log_violation(v)
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
                        state.evict_stale(datetime.now(tz=UTC))

        except asyncio.CancelledError:
            logger.info("rule_engine.consumer.stopped")
            break
        except Exception as exc:
            logger.error("rule_engine.consumer.fatal", error=str(exc))
            await asyncio.sleep(2.0)


def _log_violation(v: ViolationEvent) -> None:
    print(
        f"[VIOLATION] rule={v.rule_name} cam={v.camera_id} "
        f"zone={v.zone_id} severity={v.severity.value}"
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    setup_otel("safevision-rule-engine")
    rules_dir = Path(os.environ.get("RULES_DIR", "/etc/safevision/rules"))
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")

    rules_dir.mkdir(parents=True, exist_ok=True)
    logger.info("rule_engine.starting", rules_dir=str(rules_dir))

    loader = RuleLoader(rules_dir)
    state = RuleState()
    evaluator = RuleEvaluator(state)

    rules_lock = threading.RLock()
    rules_ref: list[list[Rule]] = [loader.load_all()]

    def _on_change() -> None:
        new = loader.load_all()
        with rules_lock:
            rules_ref[0] = new

    loader.watch(_on_change)

    redis_client = await aioredis.from_url(redis_url, decode_responses=True)
    await _ensure_consumer_group(redis_client)

    app.state.rules_dir = rules_dir
    app.state.loader = loader
    app.state.rules_lock = rules_lock
    app.state.rules_ref = rules_ref

    consumer_task = asyncio.create_task(
        _stream_consumer(redis_client, evaluator, rules_lock, rules_ref),
        name="rule-engine-consumer",
    )

    logger.info("rule_engine.ready", rules=len(rules_ref[0]))
    yield

    consumer_task.cancel()
    await asyncio.gather(consumer_task, return_exceptions=True)
    await redis_client.aclose()
    logger.info("rule_engine.stopped")


# ── REST API ───────────────────────────────────────────────────────────────

router = APIRouter(prefix="/api/v1", dependencies=[Depends(get_current_user)])


class CreateRuleBody(BaseModel):
    yaml_text: str


class PatchRuleBody(BaseModel):
    enabled: bool | None = None
    yaml_text: str | None = None


def _rule_path(rules_dir: Path, name: str) -> Path:
    safe = name.replace("/", "_").replace("..", "_")
    return rules_dir / f"{safe}.yaml"


def _parse_yaml_rule(text: str) -> Rule:
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"YAML parse error: {exc}")
    if not isinstance(data, dict) or "rule" not in data:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "YAML must have a top-level 'rule' key",
        )
    try:
        return Rule.model_validate(data["rule"])
    except ValidationError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, exc.json())


@router.get("/rules")
async def list_rules(request: Request) -> list[dict[str, Any]]:
    loader: RuleLoader = request.app.state.loader
    loop = asyncio.get_event_loop()
    rules = await loop.run_in_executor(None, loader.load_all)
    return [r.model_dump() for r in rules]


@router.post("/rules", status_code=status.HTTP_201_CREATED)
async def create_rule(body: CreateRuleBody, request: Request) -> dict[str, Any]:
    rules_dir: Path = request.app.state.rules_dir
    rule = _parse_yaml_rule(body.yaml_text)
    path = _rule_path(rules_dir, rule.name)
    if path.exists():
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Rule '{rule.name}' already exists"
        )
    path.write_text(body.yaml_text)
    logger.info("rule.created", name=rule.name)
    return rule.model_dump()


@router.patch("/rules/{name}")
async def patch_rule(name: str, body: PatchRuleBody, request: Request) -> dict[str, Any]:
    rules_dir: Path = request.app.state.rules_dir
    path = _rule_path(rules_dir, name)
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Rule '{name}' not found")

    if body.yaml_text is not None:
        rule = _parse_yaml_rule(body.yaml_text)
        if rule.name != name:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "rule.name in YAML must match URL parameter",
            )
        path.write_text(body.yaml_text)
        return rule.model_dump()

    if body.enabled is not None:
        data = yaml.safe_load(path.read_text())
        data["rule"]["enabled"] = body.enabled
        path.write_text(yaml.dump(data, default_flow_style=False, allow_unicode=True))
        rule = Rule.model_validate(data["rule"])
        logger.info("rule.toggled", name=name, enabled=body.enabled)
        return rule.model_dump()

    raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No fields to update")


@router.delete("/rules/{name}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(name: str, request: Request) -> None:
    rules_dir: Path = request.app.state.rules_dir
    path = _rule_path(rules_dir, name)
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Rule '{name}' not found")
    path.unlink()
    logger.info("rule.deleted", name=name)


# ── App assembly ───────────────────────────────────────────────────────────

app = FastAPI(
    title="SafeVision Rule Engine",
    description="Evaluates declarative YAML rules + REST API for rule management",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health", tags=["ops"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/metrics", tags=["ops"], include_in_schema=False)
async def metrics() -> Response:
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
