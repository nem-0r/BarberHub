import builtins
try:
    from pydantic import SecretStr
    builtins.SecretStr = SecretStr
except ImportError:
    pass

from celery import Celery
from config import settings

import app.users.models
import app.salons.models
import app.staff.models
import app.services.models
import app.staff_services.models
import app.schedules.models
import app.bookings.models
import app.reviews.models

celery_app = Celery(
    "worker",
    broker=f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}/0",
    backend=f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}/0",
    include=[
        "app.tasks.email_tasks",
        "app.tasks.periodic_tasks",
        "app.tasks.image_tasks",
    ]
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
}
