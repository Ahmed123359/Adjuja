import asyncio
import time

import redis as redis_lib
import structlog

from app.core.config import settings
from app.modules.bdc_scraper.repository import BdcRepository
from app.modules.bdc_scraper.scraper import BdcScraper
from app.workers.celery_app import celery_app
from app.workers.utils import run_async, task_db

log = structlog.get_logger(__name__)

MAX_PAGES = 200  # garde-fou : ~1300 resultats / ~10 par page ~= 134 pages actuellement
_COOLDOWN_KEY = "scrape:bdc:last_run"
_COOLDOWN_SECONDS = 3600  # 1h minimum entre deux scrapes BDC


def _check_and_set_cooldown() -> bool:
    """Retourne True si le cooldown est actif (scrape à ignorer)."""
    try:
        r = redis_lib.from_url(settings.redis_url, decode_responses=True)
        last_run = r.get(_COOLDOWN_KEY)
        now = time.time()
        if last_run and (now - float(last_run)) < _COOLDOWN_SECONDS:
            elapsed = int(now - float(last_run))
            log.warning(
                "Scrape BDC ignoré : cooldown actif",
                elapsed_s=elapsed,
                remaining_s=_COOLDOWN_SECONDS - elapsed,
            )
            return True
        r.set(_COOLDOWN_KEY, now, ex=_COOLDOWN_SECONDS + 60)
        return False
    except Exception as exc:
        log.warning("Redis cooldown check failed, proceeding anyway", error=str(exc))
        return False


@celery_app.task(
    name="app.workers.tasks.scrape_bdc_tasks.run_scrape_bdc_pipeline",
    bind=True,
    max_retries=2,
    default_retry_delay=300,
)
def run_scrape_bdc_pipeline(self) -> dict:
    if _check_and_set_cooldown():
        return {"status": "skipped", "reason": "cooldown"}

    log.info("Starting BDC scrape pipeline")
    try:
        result = run_async(_run())
        log.info("BDC scrape pipeline complete", result=result)
        return result
    except Exception as exc:
        log.error("BDC scrape pipeline failed", error=str(exc))
        raise self.retry(exc=exc)


async def _run() -> dict:
    scraper = BdcScraper()
    try:
        from sqlalchemy import select
        from app.core.models import ScrapedBdc

        async with task_db() as db:
            # Pas de get_new_external_ids dedie (table neuve) -- on lit
            # juste les ids deja connus pour la condition d'arret anticipe.
            existing_ids = {
                row[0] for row in (await db.execute(select(ScrapedBdc.external_id))).all()
            }

        all_items = []
        page = 1
        while page <= MAX_PAGES:
            batch = await scraper.fetch_page(page=page)
            if not batch:
                break
            all_items.extend(batch)
            new_in_batch = [b for b in batch if b.external_id not in existing_ids]
            if not new_in_batch:
                log.info("BDC: page sans nouveaute, arret anticipe", page=page)
                break
            page += 1

        if not all_items:
            return {"status": "ok", "total_saved": 0}

        # La carte listing n'a pas categorie/nature_prestation/document_url --
        # uniquement la page detail les a. Enrichir seulement les nouveaux
        # (les existants ont deja ete enrichis lors d'un scrape precedent).
        new_items = [i for i in all_items if i.external_id not in existing_ids]
        log.info("BDC: enrichissement detail", new=len(new_items), total=len(all_items))
        sem = asyncio.Semaphore(5)

        async def enrich(item):
            async with sem:
                detail = await scraper.fetch_detail(item.external_id)
                if detail:
                    item.date_publication = detail.date_publication
                    item.categorie = detail.categorie
                    item.nature_prestation = detail.nature_prestation
                    item.document_url = detail.document_url
                    item.document_nom = detail.document_nom
                    if detail.date_annulation:
                        item.date_annulation = detail.date_annulation
                        item.raison_annulation = detail.raison_annulation

        await asyncio.gather(*[enrich(i) for i in new_items])

        async with task_db() as db:
            repo = BdcRepository(db)
            async with db.begin_nested():
                saved = await repo.upsert_many(all_items)
            await db.commit()

        log.info("BDC scrape done", pages=page, total=len(all_items), saved=saved)
        return {"status": "ok", "total_saved": saved, "pages_scanned": page}
    finally:
        await scraper.close()
