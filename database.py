from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession
from config import settings

# Behind Supabase's transaction-mode pooler (pgbouncer) two things must change:
#  1. asyncpg's server-side prepared-statement cache must be disabled — a
#     pooled connection is not stable across statements, so cached plans break.
#  2. SQLAlchemy must NOT pool on top of an external pooler (double pooling
#     exhausts connections). Let pgbouncer own the pool → NullPool here.
_engine_kwargs: dict = {
    "echo": settings.DEBUG,
    # Drops dead connections before use (idle TCP can be severed server-side).
    "pool_pre_ping": True,
}
if settings.DB_PGBOUNCER:
    from sqlalchemy.pool import NullPool

    _engine_kwargs["poolclass"] = NullPool
    _engine_kwargs["connect_args"] = {"statement_cache_size": 0}
else:
    _engine_kwargs["pool_size"] = settings.DB_POOL_SIZE
    _engine_kwargs["max_overflow"] = settings.DB_MAX_OVERFLOW
    _engine_kwargs["pool_recycle"] = settings.DB_POOL_RECYCLE

engine = create_async_engine(settings.DATABASE_URL, **_engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
