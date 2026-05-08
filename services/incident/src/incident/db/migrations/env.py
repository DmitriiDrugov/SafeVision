"""
Alembic migration environment.

TODO: Configure async migrations:
    1. Import DATABASE_URL from pydantic-settings config
    2. Create async engine: create_async_engine(DATABASE_URL)
    3. Set target_metadata = Base.metadata (from db/models.py)
    4. Implement run_async_migrations() using asyncio.run()

Reference pattern:
    https://alembic.sqlalchemy.org/en/latest/cookbook.html#using-asyncio-with-alembic

    async def run_async_migrations():
        async with engine.begin() as conn:
            await conn.run_sync(do_run_migrations)

    def run_migrations_online():
        asyncio.run(run_async_migrations())
"""
import logging
from logging.config import fileConfig

from alembic import context

config = context.config
fileConfig(config.config_file_name)  # type: ignore[arg-type]
logger = logging.getLogger("alembic.env")

target_metadata = None  # TODO: from incident.db.models import Base; target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (emit SQL without a live DB connection)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode — requires a live DB. TODO: convert to async."""
    # TODO: replace with async engine pattern
    raise NotImplementedError("Implement async migration runner — see module docstring")


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
