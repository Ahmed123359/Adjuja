"""
Point d'entrée du worker de scraping.

Démarrage :
    python main.py          # local
    docker compose up worker  # Docker

Comportement :
  1. Charge la configuration depuis les variables d'environnement
  2. Lance un premier scrape immédiatement (au démarrage)
  3. Démarre le scheduler APScheduler (scrape toutes les WORKER_SCHEDULE_HOURS)
  4. Boucle indéfiniment, intercepte SIGINT/SIGTERM pour arrêt propre
"""
import logging
import signal
import sys
import time

from .config import WorkerSettings
from .scheduler import create_scheduler, run_scrape_job

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


def main() -> None:
    logger.info("Worker OffrIA — démarrage")

    settings = WorkerSettings()
    logger.info(
        "Config : acheteurs=%s max_aos=%d schedule=%dh headless=%s db=%s",
        settings.acheteurs,
        settings.max_aos,
        settings.schedule_hours,
        settings.headless,
        settings.db_path,
    )

    # Arrêt propre sur SIGINT (Ctrl+C) et SIGTERM (Docker stop)
    scheduler = create_scheduler(settings)

    def _shutdown(signum: int, _frame: object) -> None:
        logger.info("Signal %d reçu — arrêt du scheduler...", signum)
        scheduler.shutdown(wait=False)
        sys.exit(0)

    signal.signal(signal.SIGINT,  _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    # Premier scrape immédiat (sans attendre le premier intervalle)
    logger.info("Scrape initial au démarrage...")
    run_scrape_job(settings)

    scheduler.start()
    logger.info("Scheduler démarré — prochain scrape dans %dh", settings.schedule_hours)

    # Boucle principale — le scheduler tourne dans un thread daemon
    while True:
        time.sleep(60)


if __name__ == "__main__":
    main()
