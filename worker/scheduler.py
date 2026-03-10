"""
Planification des scrapes avec APScheduler.

Le scheduler tourne en arrière-plan (BackgroundScheduler).
Il exécute run_scrape_job() :
  - immédiatement au démarrage (run_now=True dans main.py)
  - puis toutes les WORKER_SCHEDULE_HOURS heures

Le job est bloquant (asyncio.run) mais s'exécute dans le thread du scheduler,
indépendamment du thread principal.
"""
import asyncio
import logging
import sqlite3

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from .config import WorkerSettings
from .db import init_db, upsert_ao
from .scraper import run_scrape

logger = logging.getLogger(__name__)

JOB_ID = "scrape_marchespublics"


def run_scrape_job(settings: WorkerSettings) -> None:
    """
    Exécute un cycle complet de scraping + persistance en base.

    Appelé par APScheduler dans un thread séparé.
    Les erreurs sont loguées mais ne font pas planter le scheduler.
    """
    logger.info("=== Démarrage du job de scraping ===")
    conn: sqlite3.Connection | None = None

    try:
        conn = init_db(settings)

        # Récupérer les refs déjà en base pour éviter de re-télécharger les ZIPs
        known_refs: set[str] = {
            row["ref_consultation"]
            for row in conn.execute("SELECT ref_consultation FROM appels_offre")
        }
        logger.info("%d AO(s) déjà en base — seules les nouvelles seront téléchargées", len(known_refs))

        results = asyncio.run(run_scrape(settings, known_refs=known_refs))

        for r in results:
            upsert_ao(conn, r, r.acheteur_filtre or "")

        ok  = sum(1 for r in results if r.fichier_path)
        nok = sum(1 for r in results if not r.fichier_path)
        logger.info("Job terminé : %d nouveaux AOs — %d OK, %d échec(s)", len(results), ok, nok)

    except Exception as exc:
        logger.exception("Erreur inattendue dans le job de scraping : %s", exc)
    finally:
        if conn:
            conn.close()


def create_scheduler(settings: WorkerSettings) -> BackgroundScheduler:
    """
    Crée et configure le BackgroundScheduler.

    Le job est ajouté avec replace_existing=True pour permettre les redémarrages
    propres sans duplication.
    """
    scheduler = BackgroundScheduler(timezone="UTC")

    scheduler.add_job(
        run_scrape_job,
        trigger=IntervalTrigger(hours=settings.schedule_hours),
        args=[settings],
        id=JOB_ID,
        name="Scrape marchespublics.gov.ma",
        replace_existing=True,
        max_instances=1,        # éviter les exécutions concurrentes
        coalesce=True,          # si un job est manqué, n'en exécuter qu'un
    )

    logger.info(
        "Scheduler configuré : job '%s' toutes les %dh",
        JOB_ID,
        settings.schedule_hours,
    )
    return scheduler
