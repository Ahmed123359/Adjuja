from datetime import date

import structlog

from app.modules.ao_scraper.repository import AoRepository
from app.modules.bdc_scraper.repository import BdcRepository
from app.workers.celery_app import celery_app
from app.workers.utils import run_async, task_db

log = structlog.get_logger(__name__)


@celery_app.task(name="app.workers.tasks.cleanup_tasks.cleanup_expired_watcher_items")
def cleanup_expired_watcher_items() -> dict:
    result = run_async(_cleanup())
    log.info("Expired watcher items cleaned up", **result)
    return result


async def _cleanup() -> dict:
    today = date.today()

    async with task_db() as db:
        ao_deleted = await AoRepository(db).delete_expired_unactioned(today)

    async with task_db() as db:
        bdc_deleted = await BdcRepository(db).delete_expired_unactioned(today)

    return {"ao_deleted": ao_deleted, "bdc_deleted": bdc_deleted}
