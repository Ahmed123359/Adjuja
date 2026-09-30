from datetime import date

import structlog

from app.core.scrape_runs import purger_passages
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


def _supprimer_fichiers(cles: list[str]) -> int:
    """Supprime les objets MinIO des elements retires. Un objet deja absent
    n'est pas une erreur ; une panne MinIO est journalisee sans bloquer."""
    if not cles:
        return 0
    from minio.deleteobjects import DeleteObject

    from app.core.config import settings
    from app.workers.tasks.download_tasks import _minio_client

    try:
        erreurs = list(_minio_client().remove_objects(
            settings.minio_bucket, [DeleteObject(k) for k in cles],
        ))
    except Exception as exc:
        log.warning("Suppression des fichiers echus impossible", error=str(exc), nb=len(cles))
        return 0
    for e in erreurs:
        log.warning("Fichier echu non supprime", key=getattr(e, "object_name", "?"), error=str(e))
    return len(cles) - len(erreurs)


async def _cleanup() -> dict:
    today = date.today()

    async with task_db() as db:
        ao_deleted, ao_cles = await AoRepository(db).delete_expired_unactioned(today)

    async with task_db() as db:
        bdc_deleted, bdc_cles = await BdcRepository(db).delete_expired_unactioned(today)

    fichiers = _supprimer_fichiers(ao_cles + bdc_cles)
    passages = await purger_passages()
    return {"ao_deleted": ao_deleted, "bdc_deleted": bdc_deleted, "files_deleted": fichiers,
            "scrape_runs_deleted": passages}
