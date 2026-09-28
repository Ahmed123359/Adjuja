"""Applique les migrations avant le demarrage de l'API.

Lance par le conteneur `api` (Dockerfile, docker-compose), jamais par les
workers Celery : un seul processus migre, pas de courses.

Trois etats possibles de la base :
- suivie par Alembic (table alembic_version) : `upgrade head` ;
- vide : `upgrade head`, toutes les migrations ;
- construite par l'ancien `create_all` du demarrage (tables presentes, pas
  d'alembic_version : c'etait le cas en dev et en production jusqu'au
  2026-09-27) : un dernier `create_all` cree les tables manquantes, comme
  l'application le faisait a chaque demarrage, puis la base est estampillee
  016 et la migration 017 ajoute ce que create_all ne fait jamais (colonnes,
  index, regles de suppression).

Usage : python -m app.scripts.migrate
"""

import asyncio
import logging
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from app.db.base import engine
from app.db.models import Base

logger = logging.getLogger("migrate")

# Derniere revision que create_all couvrait : 017 rattrape le reste.
REVISION_CREATE_ALL = "016"


async def _preparer() -> str:
    """Lit l'etat de la base et, pour une base create_all, lance le dernier
    create_all. Une seule boucle asynchrone : ouvrir la connexion dans une
    boucle et fermer le pool dans une autre leve « Event loop is closed »."""
    try:
        async with engine.connect() as conn:
            tables = set(await conn.run_sync(lambda c: inspect(c).get_table_names()))
        if "alembic_version" in tables:
            return "suivie"
        if "users" in tables:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            return "create_all"
        return "vide"
    finally:
        await engine.dispose()


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s  %(message)s")
    cfg = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))

    etat = asyncio.run(_preparer())
    if etat == "suivie":
        logger.info("Base suivie par Alembic : upgrade head.")
    elif etat == "create_all":
        logger.warning(
            "Base construite par create_all, sans suivi Alembic : tables manquantes "
            "creees, estampille %s, puis rattrapage par les migrations suivantes.",
            REVISION_CREATE_ALL,
        )
        command.stamp(cfg, REVISION_CREATE_ALL)
    else:
        logger.info("Base vide : application de toutes les migrations.")

    command.upgrade(cfg, "head")
    logger.info("Migrations a jour.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
