"""Trace des passages de scrape (table watcher.scrape_runs, voir schema.py).

Une ligne par source et par passage. Lue par le panneau d'administration du
backend : dernier passage reussi, derniere erreur, source en retard.

Ecrire la trace ne doit jamais faire echouer un scrape : toute erreur est
journalisee et avalee.
"""

from datetime import datetime, timezone

import structlog
from sqlalchemy import text

from app.workers.utils import task_db

log = structlog.get_logger(__name__)

# Declenchements possibles : Celery Beat, ou un administrateur depuis le panneau.
PLANIFIE, ADMIN = "planifie", "admin"
DECLENCHEMENTS = (PLANIFIE, ADMIN)

# Au-dela, la table ne sert plus au diagnostic.
CONSERVATION_JOURS = 90
_ERREUR_MAX = 2000


def maintenant() -> datetime:
    return datetime.now(timezone.utc)


def normaliser_declenchement(valeur: str | None) -> str:
    return valeur if valeur in DECLENCHEMENTS else PLANIFIE


async def enregistrer_passage(
    source: str,
    debut: datetime,
    statut: str,
    trouves: int = 0,
    enregistres: int = 0,
    erreur: str | None = None,
    declenchement: str = PLANIFIE,
) -> None:
    try:
        async with task_db() as db:
            await db.execute(
                text("""
                    INSERT INTO watcher.scrape_runs
                        (source, debut, fin, statut, trouves, enregistres, erreur, declenchement)
                    VALUES (:source, :debut, NOW(), :statut, :trouves, :enregistres, :erreur, :declenchement)
                """),
                {
                    "source": source, "debut": debut, "statut": statut,
                    "trouves": trouves, "enregistres": enregistres,
                    "erreur": erreur[:_ERREUR_MAX] if erreur else None,
                    "declenchement": normaliser_declenchement(declenchement),
                },
            )
            await db.commit()
    except Exception as exc:
        log.warning("Passage de scrape non enregistre", source=source, statut=statut, error=str(exc))


async def purger_passages() -> int:
    try:
        async with task_db() as db:
            res = await db.execute(text(
                f"DELETE FROM watcher.scrape_runs WHERE debut < NOW() - INTERVAL '{CONSERVATION_JOURS} days'"
            ))
            await db.commit()
            return res.rowcount or 0
    except Exception as exc:
        log.warning("Purge des passages de scrape impossible", error=str(exc))
        return 0
