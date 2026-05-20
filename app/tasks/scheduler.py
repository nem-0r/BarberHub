"""APScheduler setup — runs in-process when USE_CELERY=False.

Mirrors the Celery beat schedule in ``celery_app.py``. Both worlds stay in
sync at the level of the underlying async impls:

    _check_and_send_reminders   (every 10 min)
    _mark_no_shows              (every 15 min)
    _cancel_stale_pending       (every 15 min)

These are the SAME functions Celery's @task wrappers call, so changing the
business logic in periodic_tasks.py updates both modes simultaneously.

Started/stopped from ``main.lifespan``; a no-op when settings.USE_CELERY is
True (the worker container drives beat instead).
"""
from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)

_scheduler: Optional["AsyncIOScheduler"] = None  # type: ignore[name-defined]


def start_scheduler() -> None:
    """Start the in-process periodic scheduler. Safe to call once at startup."""
    global _scheduler
    if _scheduler is not None:
        return

    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from apscheduler.triggers.interval import IntervalTrigger
    except ImportError:
        logger.warning(
            "APScheduler not installed — periodic jobs are disabled. "
            "Set USE_CELERY=True or `pip install apscheduler`."
        )
        return

    from app.tasks.periodic_tasks import (
        _check_and_send_reminders,
        _mark_no_shows,
        _cancel_stale_pending,
    )

    sched = AsyncIOScheduler(timezone="UTC")
    sched.add_job(
        _check_and_send_reminders,
        IntervalTrigger(minutes=10),
        id="reminders",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    sched.add_job(
        _mark_no_shows,
        IntervalTrigger(minutes=15),
        id="mark_no_show",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    sched.add_job(
        _cancel_stale_pending,
        IntervalTrigger(minutes=15),
        id="cancel_stale_pending",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    sched.start()
    _scheduler = sched
    logger.info(
        "[Scheduler] APScheduler started — 3 jobs registered "
        "(reminders/10m, no-show/15m, cancel-stale/15m)."
    )


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is None:
        return
    try:
        _scheduler.shutdown(wait=False)
    except Exception:
        logger.exception("Failed to shut down APScheduler cleanly")
    finally:
        _scheduler = None
        logger.info("[Scheduler] APScheduler stopped.")
