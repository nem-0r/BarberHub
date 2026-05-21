"""Concurrency proof for the booking engine (advice.md red flag #2).

This is THE test a senior asks for: "you say you solved double-booking —
prove it under real parallel load." It fires N simultaneous create_booking
calls for the SAME barber and SAME slot, each in its OWN async session
(== its own transaction — required, because pg_advisory_xact_lock is
transaction-scoped; a shared session would not actually exercise the lock).

Invariant: exactly ONE booking is created; every other concurrent attempt
fails with BookingConflictError. No "both succeeded" race.

Needs a REAL throwaway Postgres (advisory locks + SELECT FOR UPDATE do not
exist on SQLite). Skipped unless TEST_DATABASE_URL is set, so the
infra-free CI/suite stays green. To run it:

    docker run --rm -d --name pgtest -e POSTGRES_PASSWORD=test \\
        -p 5433:5432 postgres:16
    TEST_DATABASE_URL=postgresql+asyncpg://postgres:test@localhost:5433/postgres \\
        pytest tests/test_booking_concurrency.py -v
    docker rm -f pgtest

This is also the seed for the advice.md MEDIUM item "extend CI with a
Postgres service" — wire the same env var in a CI job.
"""
import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

TEST_DB_URL = os.environ.get("TEST_DATABASE_URL")

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(
        not TEST_DB_URL,
        reason="Set TEST_DATABASE_URL to a disposable Postgres to run "
               "the double-booking concurrency test (see module docstring).",
    ),
]

CONCURRENCY = 8
_SALON_TZ = "Asia/Almaty"


@pytest_asyncio.fixture
async def seeded_engine():
    """Fresh schema + a minimal valid graph (client, owner, salon, staff,
    service, staff_service link, all-day schedule) so create_booking gets
    past every pre-check and only the concurrency guard decides the outcome.
    NullPool → every session gets its own physical connection, so the N
    coroutines really do run in N separate transactions."""
    from app.users.models import User, UserRole
    from app.salons.models import Salon
    from app.staff.models import Staff
    from app.services.models import Service
    from app.schedules.models import Schedule
    from app.staff_services.models import StaffService

    engine = create_async_engine(TEST_DB_URL, poolclass=NullPool)

    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    # Booking 30 days out at 12:00 salon-local (07:00 UTC for UTC+5) — safely
    # inside working hours, comfortably in the future.
    start_utc = (datetime.now(timezone.utc) + timedelta(days=30)).replace(
        hour=7, minute=0, second=0, microsecond=0
    )
    local_weekday = start_utc.astimezone(ZoneInfo(_SALON_TZ)).weekday()

    ids = {
        "client": uuid.uuid4(), "owner": uuid.uuid4(), "staff_user": uuid.uuid4(),
        "salon": uuid.uuid4(), "staff": uuid.uuid4(), "service": uuid.uuid4(),
    }

    async with AsyncSession(engine) as s:
        s.add(User(id=ids["client"], email=f"c-{ids['client']}@t.io",
                   full_name="Client", role=UserRole.client))
        s.add(User(id=ids["owner"], email=f"o-{ids['owner']}@t.io",
                   full_name="Owner", role=UserRole.owner))
        s.add(User(id=ids["staff_user"], email=f"s-{ids['staff_user']}@t.io",
                   full_name="Barber", role=UserRole.staff))
        s.add(Salon(id=ids["salon"], owner_id=ids["owner"], name="Salon",
                    address="addr", timezone=_SALON_TZ))
        s.add(Staff(id=ids["staff"], user_id=ids["staff_user"],
                    salon_id=ids["salon"], position="Barber", is_active=True))
        s.add(Service(id=ids["service"], salon_id=ids["salon"], name="Cut",
                      base_price=Decimal("10.00"), duration_minutes=30,
                      is_active=True))
        s.add(StaffService(staff_id=ids["staff"], service_id=ids["service"]))
        s.add(Schedule(staff_id=ids["staff"], day_of_week=local_weekday,
                       start_time=datetime(2000, 1, 1, 0, 0).time(),
                       end_time=datetime(2000, 1, 1, 23, 59).time(),
                       is_day_off=False))
        await s.commit()

    yield engine, ids, start_utc

    # Best-effort cleanup so reruns against the same DB stay isolated.
    async with AsyncSession(engine) as s:
        from sqlalchemy import text
        for tbl, col, val in [
            ("bookings", "staff_id", ids["staff"]),
            ("staff_services", "staff_id", ids["staff"]),
            ("schedules", "staff_id", ids["staff"]),
            ("staff", "id", ids["staff"]),
            ("services", "id", ids["service"]),
            ("salons", "id", ids["salon"]),
            ("users", "id", ids["client"]),
            ("users", "id", ids["owner"]),
            ("users", "id", ids["staff_user"]),
        ]:
            await s.execute(text(f"DELETE FROM {tbl} WHERE {col} = :v"), {"v": str(val)})
        await s.commit()
    await engine.dispose()


async def _attempt(engine, data):
    """One isolated booking attempt = one session = one transaction."""
    from app.bookings.service import create_booking

    async with AsyncSession(engine) as session:
        try:
            booking = await create_booking(data, session)
            return ("ok", booking.id)
        except Exception as exc:  # noqa: BLE001 — we classify it in the test
            return ("err", exc)


async def test_concurrent_double_booking_allows_exactly_one(seeded_engine):
    from app.bookings.schemas import BookingCreate
    from app.bookings.models import Booking, BookingStatus
    from app.exceptions import BookingConflictError
    from sqlmodel import select

    engine, ids, start_utc = seeded_engine
    data = BookingCreate(
        client_id=ids["client"], staff_id=ids["staff"],
        service_id=ids["service"], start_time=start_utc,
    )

    # Fire all attempts at once for the SAME barber/slot.
    results = await asyncio.gather(
        *[_attempt(engine, data) for _ in range(CONCURRENCY)]
    )

    successes = [r for r in results if r[0] == "ok"]
    failures = [exc for tag, exc in results if tag == "err"]

    # 1. Exactly one attempt won.
    assert len(successes) == 1, (
        f"expected exactly 1 booking, got {len(successes)} "
        f"(double-booking race!). failures={[type(e).__name__ for e in failures]}"
    )

    # 2. Every loser failed for the RIGHT reason — the conflict guard, not
    #    some incidental error that would mask a real race.
    assert len(failures) == CONCURRENCY - 1
    assert all(isinstance(e, BookingConflictError) for e in failures), (
        f"unexpected failure types: {[type(e).__name__ for e in failures]}"
    )

    # 3. The database physically holds exactly one active booking for the slot.
    async with AsyncSession(engine) as s:
        rows = (await s.exec(
            select(Booking).where(
                Booking.staff_id == ids["staff"],
                Booking.status.in_([BookingStatus.pending, BookingStatus.confirmed]),
            )
        )).all()
    assert len(rows) == 1
    assert rows[0].status == BookingStatus.confirmed
