import io
import random
import time

import httpx
import structlog
from minio import Minio

from app.core import download_progress
from app.core.config import settings
from app.modules.bdc_scraper.repository import BdcRepository
from app.workers.celery_app import celery_app
from app.workers.utils import run_async, task_db

log = structlog.get_logger(__name__)

USER_AGENTS = [
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
]

_MAX_RETRIES = 3
_RETRY_DELAY_S = 60


class PermanentDownloadError(Exception):
    """Erreur qu'aucune relance ne peut corriger (BDC inexistant, aucun document).
    Meme regle que download_tasks.py."""


def _minio_client() -> Minio:
    client = Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )
    if not client.bucket_exists(settings.minio_bucket):
        client.make_bucket(settings.minio_bucket)
        log.info("MinIO bucket created", bucket=settings.minio_bucket)
    return client


@celery_app.task(
    name="app.workers.tasks.download_bdc_tasks.download_bdc_document",
    bind=True,
    max_retries=_MAX_RETRIES,
    default_retry_delay=_RETRY_DELAY_S,
)
def download_bdc_document(self, bdc_id: int) -> dict:
    """Telecharge le document unique d'un BDC vers MinIO, declenche au
    moment ou l'utilisateur le favorise. Confirme anonyme (curl sans
    cookies -> 200 + vrai zip) -- pas de classification multi-fichiers
    necessaire ici, contrairement aux AOs : un seul fichier stocke tel quel."""
    tentative = self.request.retries + 1
    max_tentatives = self.max_retries + 1
    log.info("Starting BDC document download", bdc_id=bdc_id, tentative=tentative)
    download_progress.set_step(
        "bdc", bdc_id, "reception_fichier", tentative=tentative, max_tentatives=max_tentatives,
    )
    try:
        result = run_async(_download(bdc_id))
        download_progress.clear("bdc", bdc_id)
        log.info("BDC document download complete", bdc_id=bdc_id, result=result)
        return result
    except PermanentDownloadError as exc:
        log.error("BDC document download impossible, no retry", bdc_id=bdc_id, error=str(exc))
        run_async(_save_error(bdc_id, str(exc)))
        download_progress.clear("bdc", bdc_id)
        return {"bdc_id": bdc_id, "error": str(exc)}
    except Exception as exc:
        if self.request.retries < self.max_retries:
            # Pas d'ecriture de l'erreur en base avant une relance : l'ecran la
            # prendrait pour definitive (voir download_tasks.py).
            log.warning("BDC document download failed, retrying", bdc_id=bdc_id, tentative=tentative, error=str(exc))
            download_progress.set_step(
                "bdc", bdc_id, "nouvelle_tentative",
                tentative=tentative, max_tentatives=max_tentatives,
                prochaine_tentative=time.time() + _RETRY_DELAY_S,
            )
            raise self.retry(exc=exc)
        log.error("BDC document download failed, no retry left", bdc_id=bdc_id, error=str(exc))
        run_async(_save_error(bdc_id, str(exc)))
        download_progress.clear("bdc", bdc_id)
        raise


async def _download(bdc_id: int) -> dict:
    async with task_db() as db:
        repo = BdcRepository(db)
        bdc = await repo.get_by_id(bdc_id)

    if not bdc:
        raise PermanentDownloadError(f"Bon de commande {bdc_id} introuvable.")
    if not bdc.document_url:
        raise PermanentDownloadError("Aucun document publié pour ce bon de commande.")

    headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Referer": bdc.url_source,
    }
    async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=60) as client:
        resp = await client.get(bdc.document_url)
        resp.raise_for_status()
        content = resp.content

    if not content:
        raise ValueError("Le portail n'a renvoyé aucun fichier.")

    filename = (bdc.document_nom or "document").strip()
    minio_key = f"bdc-watcher/{bdc_id}/{filename}"
    minio = _minio_client()
    minio.put_object(
        settings.minio_bucket,
        minio_key,
        io.BytesIO(content),
        length=len(content),
        content_type=resp.headers.get("content-type", "application/octet-stream"),
    )

    async with task_db() as db:
        repo = BdcRepository(db)
        await repo.update_zip_result(bdc_id=bdc_id, zip_minio_key=minio_key, error=None)

    return {"bdc_id": bdc_id, "minio_key": minio_key}


async def _save_error(bdc_id: int, error: str) -> None:
    async with task_db() as db:
        repo = BdcRepository(db)
        await repo.update_zip_result(bdc_id=bdc_id, zip_minio_key=None, error=error)
