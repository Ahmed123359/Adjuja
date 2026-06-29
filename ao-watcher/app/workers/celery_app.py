from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "ao_watcher",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.workers.tasks.scrape_tasks",
        "app.workers.tasks.download_tasks",
        "app.workers.tasks.scrape_bdc_tasks",
        "app.workers.tasks.download_bdc_tasks",
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
    },
)
