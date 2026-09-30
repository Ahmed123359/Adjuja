import asyncio

from celery import Celery
from celery.schedules import crontab
from celery.signals import worker_init

from app.core.config import settings
from app.core.schema import assurer_colonnes

celery_app = Celery(
    "ao_watcher",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.workers.tasks.scrape_tasks",
        "app.workers.tasks.download_tasks",
        "app.workers.tasks.scrape_bdc_tasks",
        "app.workers.tasks.download_bdc_tasks",
        "app.workers.tasks.cleanup_tasks",
        "app.workers.tasks.ocr_tasks",
        "app.workers.tasks.admin_tasks",
    ],
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
        "scrape-all-mpe-portals": {
            "task": "app.workers.tasks.scrape_tasks.run_scrape_pipeline",
            "schedule": crontab(hour=f"*/{settings.scrape_interval_hours}", minute=0),
        },
        "scrape-bdc": {
            "task": "app.workers.tasks.scrape_bdc_tasks.run_scrape_bdc_pipeline",
            "schedule": crontab(hour=f"*/{settings.scrape_interval_hours}", minute=15),
        },
        "cleanup-expired-watcher-items": {
            "task": "app.workers.tasks.cleanup_tasks.cleanup_expired_watcher_items",
            "schedule": crontab(hour=2, minute=0),
        },
    },
)


@worker_init.connect
def _assurer_colonnes(**_: object) -> None:
    """Avant le premier scrape : l'upsert ecrit dans les colonnes ajoutees
    (app.core.schema), le worker peut demarrer avant l'API."""
    asyncio.run(assurer_colonnes())
