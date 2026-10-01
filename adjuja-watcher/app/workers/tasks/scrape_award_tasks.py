"""Collecte quotidienne des résultats publiés (lot A). Spec :
context/feature-spec/resultats-attribution/api.md, suivi-resultats/ (phase 2).

Ordre : résultats BDC, puis annonces AO (résultat définitif, extrait de PV)
de chaque portail configuré, puis les liens de pièces jointes, au plus
`MAX_FICHES` par passage : le reste est repris au passage suivant, pour ne
jamais solliciter le portail par rafales. L'échec d'une source n'arrête pas
les suivantes ; chaque source est tracée dans watcher.scrape_runs.
"""

import asyncio
import random
from datetime import timedelta
from pathlib import Path

import redis as redis_lib
import structlog

from app.core.config import settings
from app.core.scrape_runs import PLANIFIE, enregistrer_passage, maintenant
from app.modules.award_scraper.repository import AwardRepository
from app.modules.award_scraper.scraper import TYPES_ANNONCE, BdcResultScraper, MPEAwardScraper
from app.workers.celery_app import celery_app
from app.workers.utils import run_async, task_db

log = structlog.get_logger(__name__)

SCRAPERS_DIR = Path(__file__).parent.parent.parent.parent / "scrapers"
MAX_PAGES_BDC = 50
MAX_FICHES = 300
PAGES_DEMARRAGE = 2                  # premier passage AO : 2 pages de 500
_COOLDOWN_KEY, _COOLDOWN_S = "scrape:award:last_run", 3600


def _cooldown_actif() -> bool:
    try:
        r = redis_lib.from_url(settings.redis_url, decode_responses=True)
        return not r.set(_COOLDOWN_KEY, "1", nx=True, ex=_COOLDOWN_S)
    except Exception as exc:
        log.warning("Cooldown des résultats non vérifié", error=str(exc))
        return False


@celery_app.task(name="app.workers.tasks.scrape_award_tasks.run_scrape_awards_pipeline", bind=True, acks_late=False)
def run_scrape_awards_pipeline(self, declenchement: str = PLANIFIE) -> dict:
    if _cooldown_actif():
        return {"status": "skipped", "reason": "cooldown"}
    return run_async(_collecter(declenchement))


async def _collecter(declenchement: str) -> dict:
    limite_demarrage = maintenant() - timedelta(days=settings.award_bootstrap_days)
    rapport: dict = {"status": "ok"}
    rapport["bdc"] = await _bdc(limite_demarrage, declenchement)
    for config in sorted(p.stem.replace(".config", "") for p in SCRAPERS_DIR.glob("*.config.json")):
        scraper = MPEAwardScraper(config)
        if not scraper.acfg:
            continue
        for type_resultat in TYPES_ANNONCE:
            rapport[f"{config}_{type_resultat}"] = await _annonces(scraper, type_resultat, declenchement)
    rapport["pieces_jointes"] = await _pieces_jointes()
    log.info("Collecte des résultats terminée", **{k: v for k, v in rapport.items() if k != "status"})
    return rapport


async def _bdc(limite_demarrage, declenchement: str) -> dict:
    debut, lus, nouveaux = maintenant(), 0, 0
    scraper = BdcResultScraper()
    try:
        for n in range(1, MAX_PAGES_BDC + 1):
            page = await scraper.page(n)
            if not page:
                break
            lus += len(page)
            async with task_db() as db:
                repo = AwardRepository(db)
                connues = await repo.cles_connues(scraper.source, "bdc", [r.cle_externe for r in page])
                nouveaux += await repo.enregistrer(page)
            trop_ancienne = all(r.date_publication and r.date_publication < limite_demarrage for r in page)
            if len(connues) == len(page) or trop_ancienne:
                break
            await asyncio.sleep(random.uniform(1, 2))
        await enregistrer_passage("resultats_bdc", debut, "ok", lus, nouveaux, declenchement=declenchement)
        return {"lus": lus, "nouveaux": nouveaux}
    except Exception as exc:
        log.error("Résultats BDC en échec", error=str(exc))
        await enregistrer_passage("resultats_bdc", debut, "erreur", lus, nouveaux,
                                  erreur=f"{type(exc).__name__}: {exc}", declenchement=declenchement)
        return {"erreur": str(exc)[:200]}
    finally:
        await scraper.close()


async def _annonces(scraper: MPEAwardScraper, type_resultat: str, declenchement: str) -> dict:
    """Lit jusqu'à une page entièrement connue. Premier passage (aucune
    annonce de ce type en base) : `PAGES_DEMARRAGE` pages seulement."""
    debut = maintenant()
    nom = f"resultats_{scraper.source}_{type_resultat}"
    try:
        async with task_db() as db:
            deja = await AwardRepository(db).derniere_publication(scraper.source, type_resultat) is not None

        async def arreter(page, numero: int) -> bool:
            if not deja:
                return numero >= PAGES_DEMARRAGE
            async with task_db() as db:
                connues = await AwardRepository(db).cles_connues(
                    scraper.source, type_resultat, [r.cle_externe for r in page])
            return len(connues) == len(page)

        annonces = await scraper.annonces(type_resultat, arreter)
        async with task_db() as db:
            nouveaux = await AwardRepository(db).enregistrer(annonces)
        await enregistrer_passage(nom, debut, "ok", len(annonces), nouveaux, declenchement=declenchement)
        return {"lus": len(annonces), "nouveaux": nouveaux}
    except Exception as exc:
        log.error("Annonces de résultat en échec", source=nom, error=str(exc))
        await enregistrer_passage(nom, debut, "erreur", erreur=f"{type(exc).__name__}: {exc}", declenchement=declenchement)
        return {"erreur": str(exc)[:200]}


async def _pieces_jointes() -> dict:
    async with task_db() as db:
        a_lire = await AwardRepository(db).sans_pieces_jointes(MAX_FICHES)
    scrapers: dict[str, MPEAwardScraper] = {}
    lues, echecs = 0, 0
    try:
        for r in a_lire:
            scraper = scrapers.setdefault(r.source, MPEAwardScraper(r.source))
            try:
                pieces = await scraper.pieces_jointes(r.url_source)
            except Exception as exc:
                echecs += 1
                log.warning("Fiche de résultat illisible", id=r.id, error=str(exc)[:120])
                continue
            async with task_db() as db:
                await AwardRepository(db).poser_pieces_jointes(r.id, pieces)
            lues += 1
            await asyncio.sleep(random.uniform(*scraper.cfg["delays"]["between_detail_requests_s"]))
    finally:
        for s in scrapers.values():
            await s._close()
    return {"fiches_lues": lues, "echecs": echecs, "restantes": max(0, len(a_lire) - lues - echecs)}
