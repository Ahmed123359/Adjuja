import asyncio
import time
from pathlib import Path

import httpx
import redis as redis_lib
import structlog

from app.core.config import settings
from app.modules.ao_scraper.mpe import MPEPlatformScraper
from app.modules.ao_scraper.repository import AoRepository
from app.workers.celery_app import celery_app
from app.workers.utils import run_async, task_db

log = structlog.get_logger(__name__)

SCRAPERS_DIR = Path(__file__).parent.parent.parent.parent / "scrapers"
_COOLDOWN_KEY = "scrape:ao:last_run"
_COOLDOWN_SECONDS = 3600  # 1h minimum entre deux scrapes AO


def _get_all_configs() -> list[str]:
    """Return all config names (without .config.json extension)."""
    return [p.stem.replace(".config", "") for p in SCRAPERS_DIR.glob("*.config.json")]


def _check_and_set_cooldown() -> bool:
    """Retourne True si le cooldown est actif (scrape à ignorer)."""
    try:
        r = redis_lib.from_url(settings.redis_url, decode_responses=True)
        last_run = r.get(_COOLDOWN_KEY)
        now = time.time()
        if last_run and (now - float(last_run)) < _COOLDOWN_SECONDS:
            elapsed = int(now - float(last_run))
            log.warning(
                "Scrape AO ignoré : cooldown actif",
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
    name="app.workers.tasks.scrape_tasks.run_scrape_pipeline",
    bind=True,
    max_retries=2,
    default_retry_delay=300,
)
def run_scrape_pipeline(self) -> dict:
    if _check_and_set_cooldown():
        return {"status": "skipped", "reason": "cooldown"}

    log.info("Starting scrape pipeline")
    try:
        result = run_async(_run_all_sources())
        log.info("Scrape pipeline complete", result=result)

        if result.get("total_saved", 0) > 0:
            _trigger_notification_batch(result["total_saved"])

        return result
    except Exception as exc:
        log.error("Scrape pipeline failed", error=str(exc))
        raise self.retry(exc=exc)


def _trigger_notification_batch(new_ao_count: int) -> None:
    """
    Appelle POST /admin/trigger sur le notification-service.
    Non bloquant : timeout court, échec silencieux (le scrape ne doit pas échouer
    à cause du service de notification).
    """
    url = f"{settings.notification_service_url}/admin/trigger"
    try:
        resp = httpx.post(
            url,
            headers={"X-Admin-Secret": settings.notification_admin_secret},
            timeout=5.0,
        )
        if resp.status_code == 200:
            log.info("Notification batch triggered", new_aos=new_ao_count, task_id=resp.json().get("task_id"))
        else:
            log.warning("Notification trigger responded with error", status=resp.status_code, body=resp.text)
    except httpx.TimeoutException:
        log.warning("Notification trigger timeout  notification-service injoignable, le batch Beat prendra le relais")
    except Exception as exc:
        log.warning("Notification trigger failed", error=str(exc))


async def _run_all_sources() -> dict:
    configs = _get_all_configs()
    total_saved = 0
    results = {}

    for config_name in configs:
        try:
            saved = await _scrape_source(config_name)
            total_saved += saved
            results[config_name] = {"status": "ok", "saved": saved}
        except Exception as exc:
            log.error("Source scrape failed", source=config_name, error=str(exc))
            results[config_name] = {"status": "error", "error": str(exc)}

    return {"status": "ok", "total_saved": total_saved, "sources": results}


async def _scrape_source(config_name: str) -> int:
    scraper = MPEPlatformScraper(config_name)
    log.info("Scraping source", source=config_name)

    # Fetch all pages from listing
    all_aos = await scraper.fetch_page()
    if not all_aos:
        log.info("No AOs found", source=config_name)
        return 0

    # Fetch details for AOs not yet in DB (new ones only)
    async with task_db() as db:
        repo = AoRepository(db)
        existing_ids = await repo.get_new_external_ids(config_name)

    new_aos = [ao for ao in all_aos if ao.external_id not in existing_ids]
    log.info("New AOs to fetch detail for", source=config_name, new=len(new_aos), existing=len(existing_ids))

    # Enrich new AOs with detail page data (concurrency=5)
    sem = asyncio.Semaphore(5)

    async def enrich(ao):
        async with sem:
            detail = await scraper.fetch_detail(ao.external_id, _org_from_url(ao.url_source))
            if detail:
                # Merge: keep listing data, override with detail where richer
                ao.titre = detail.titre or ao.titre
                ao.acheteur = detail.acheteur or ao.acheteur
                ao.date_publication = detail.date_publication or ao.date_publication
                ao.date_limite = detail.date_limite or ao.date_limite
                ao.categorie = detail.categorie or ao.categorie
                ao.secteur = detail.secteur or ao.secteur
                ao.budget_estime = detail.budget_estime
                ao.caution = detail.caution
                ao.zip_url = detail.zip_url

    await asyncio.gather(*[enrich(ao) for ao in new_aos])

    # Upsert all AOs -- COALESCE preserve date_publication deja en DB
    async with task_db() as db:
        repo = AoRepository(db)
        async with db.begin_nested():
            saved = await repo.upsert_many(all_aos)
        await db.commit()

    log.info("Source scrape done", source=config_name, total=len(all_aos), new=len(new_aos), saved=saved)
    return saved


def _org_from_url(url: str) -> str:
    from urllib.parse import parse_qs, urlparse
    qs = parse_qs(urlparse(url).query)
    return qs.get("orgAcronyme", [""])[0]
