from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

# Import channels so the factory registry is populated before any task runs.
import app.channels.email.resend_channel  # noqa: F401

# Import templates so the registry is populated before any task runs.
from app.templates.ao_digest import AoDigestTemplate
from app.templates.registry import TemplateRegistry

TemplateRegistry.register("ao_digest", AoDigestTemplate())

celery_app = Celery(
    "notification_service",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.workers.tasks.batch_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Africa/Casablanca",
    enable_utc=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        "notification-due-check": {
            "task": "app.workers.tasks.batch_tasks.run_notification_batch",
            "schedule": crontab(minute=0),  # toutes les heures, pile à l'heure
        },
    },
)
