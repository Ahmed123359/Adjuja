"""OCR des CPS/RC scannes d'un AO (2026-09-27).

Lancee par `POST /aos/{id}/verdict` quand l'analyse ne trouve aucun texte : lit
chaque document sans couche texte par Tesseract (`app/modules/ao_scraper/ocr.py`),
met le texte en cache sur MinIO, et publie sa progression en Redis
(`download_progress`, genre « ocr ») pour que le panneau affiche
« page 23 / 70 ». L'analyse, relancee par le panneau, lit ensuite le cache.
"""

import structlog
from sqlalchemy import select

from app.core import download_progress
from app.core.config import settings
from app.core.models import ScrapedAo
from app.modules.ao_scraper.analysis import _collect_docs, _minio_client
from app.modules.ao_scraper import ocr
from app.workers.celery_app import celery_app
from app.workers.utils import run_async, task_db

log = structlog.get_logger(__name__)

KIND = "ocr"


async def _documents(ao_id: int) -> list[str]:
    async with task_db() as db:
        ao = (await db.execute(select(ScrapedAo).where(ScrapedAo.id == ao_id))).scalar_one_or_none()
    if not ao:
        return []
    docs = ao.classified_docs or {}
    return [key for prefixe in ("cps", "rc") for _, key in _collect_docs(docs, prefixe)]


@celery_app.task(name="app.workers.tasks.ocr_tasks.ocr_ao_documents", acks_late=True)
def ocr_ao_documents(ao_id: int) -> dict:
    minio = _minio_client()
    bucket = settings.minio_bucket
    try:
        # Seuls les documents sans couche texte et sans cache sont lus.
        a_lire: list[tuple[str, bytes, int]] = []
        for key in run_async(_documents(ao_id)):
            if ocr.lire_cache(minio, bucket, key) is not None:
                continue
            resp = minio.get_object(bucket, key)
            try:
                data = resp.read()
            finally:
                resp.close()
                resp.release_conn()
            texte, pages = ocr.texte_natif(data)
            if len(texte.strip()) < ocr.SEUIL_TEXTE:
                a_lire.append((key, data, pages))

        total = sum(p for _, _, p in a_lire)
        faites = 0
        download_progress.set_step(KIND, ao_id, "ocr", page=0, pages=total)

        def page_lue() -> None:
            nonlocal faites
            faites += 1
            download_progress.set_step(KIND, ao_id, "ocr", page=faites, pages=total)

        for key, data, _ in a_lire:
            texte = ocr.ocr_pdf(data, on_page=page_lue)
            ocr.ecrire_cache(minio, bucket, key, texte)
            log.info("OCR termine", ao_id=ao_id, minio_key=key, caracteres=len(texte))

        download_progress.clear(KIND, ao_id)
        return {"ao_id": ao_id, "documents": len(a_lire), "pages": total}
    except Exception as exc:
        log.error("OCR echoue", ao_id=ao_id, error=str(exc))
        # Trace d'echec lue par la route : le panneau affiche l'erreur et un
        # nouveau clic relance l'OCR.
        download_progress.set_step(KIND, ao_id, "erreur")
        raise
