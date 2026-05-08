"""Database migration runner.

Uses Alembic for PostgreSQL (production) and SQLAlchemy create_all for SQLite
(in-memory test databases, which don't support Alembic's version table well
with aiosqlite).
"""
from __future__ import annotations

import asyncio
from pathlib import Path

import structlog
from sqlalchemy.ext.asyncio import AsyncEngine

logger = structlog.get_logger(__name__)

_MIGRATIONS_DIR = Path(__file__).parent / "migrations"


async def run_migrations(database_url: str, engine: AsyncEngine) -> None:
    if "sqlite" in database_url:
        await _create_all(engine)
    else:
        logger.info("db.migrations.running", url=database_url.split("@")[-1])
        await asyncio.get_event_loop().run_in_executor(
            None, _alembic_upgrade, database_url
        )
        logger.info("db.migrations.done")


async def _create_all(engine: AsyncEngine) -> None:
    from .models import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


def _alembic_upgrade(database_url: str) -> None:
    """Run 'alembic upgrade head' synchronously (called from a thread)."""
    from alembic import command
    from alembic.config import Config

    cfg = Config()
    cfg.set_main_option("script_location", str(_MIGRATIONS_DIR))
    # env.py reads DATABASE_URL from the environment; set it for the thread too
    import os

    os.environ.setdefault("DATABASE_URL", database_url)
    command.upgrade(cfg, "head")
