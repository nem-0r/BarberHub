import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context
from sqlmodel import SQLModel
from config import settings

import app.users.models
import app.salons.models
import app.staff.models
import app.services.models
import app.staff_services.models
import app.schedules.models
import app.bookings.models
import app.reviews.models

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = settings.MIGRATION_DATABASE_URL or settings.DATABASE_URL
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Create engine and run migrations asynchronously."""
    configuration = config.get_section(config.config_ini_section, {})
    mig_url = settings.MIGRATION_DATABASE_URL or settings.DATABASE_URL
    configuration["sqlalchemy.url"] = mig_url
    connect_args = {}
    if settings.DB_PGBOUNCER and not settings.MIGRATION_DATABASE_URL:
        connect_args = {"statement_cache_size": 0}
    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=connect_args,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""

    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
