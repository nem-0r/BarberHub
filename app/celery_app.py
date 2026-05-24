import builtins

try:
    from pydantic import SecretStr

    builtins.SecretStr = SecretStr
except ImportError:
    pass

from celery import Celery
from config import settings
from app import register_models

register_models()

_broker_url = settings.effective_redis_url(0)
celery_app = Celery(
    "worker",
    broker=_broker_url,
    backend=_broker_url,
    include=[
        "app.tasks.email_tasks",
        "app.tasks.periodic_tasks",
        "app.tasks.image_tasks",
    ],
)

celery_app.conf.task_routes = {
    "app.tasks.email_tasks.*": {"queue": "email_queue"},
    "app.tasks.image_tasks.*": {"queue": "image_queue"},
}

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)


celery_app.conf.beat_schedule = {
    "reminder-every-10-minutes": {
        "task": "check_upcoming_bookings_task",
        "schedule": 600.0,
    },
    "mark-no-show-every-15-minutes": {
        "task": "mark_no_show_bookings_task",
        "schedule": 900.0,
    },
    "cancel-stale-pending-every-15-minutes": {
        "task": "cancel_stale_pending_task",
        "schedule": 900.0,
    },
}
