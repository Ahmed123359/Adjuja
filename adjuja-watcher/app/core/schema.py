"""Colonnes ajoutees apres coup aux tables de la veille.

La veille n'a pas d'Alembic : `init_db.py` (create_all) cree les tables mais
n'ajoute jamais une colonne a une table existante, d'ou les ALTER a lancer a la
main par environnement (voir l'en-tete d'init_db.py pour mode_passation).
Ceux-ci tournent seuls au demarrage de l'API et du worker, avant tout acces :
idempotents, sans perte de donnees.
"""

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings

log = structlog.get_logger(__name__)

COLONNES_AJOUTEES: tuple[str, ...] = (
    # 2026-09-30 : reference de l'avis telle que publiee (« 10012003 »),
    # distincte d'external_id (refConsultation interne du portail).
    "ALTER TABLE watcher.scraped_aos ADD COLUMN IF NOT EXISTS reference VARCHAR(255)",
)


async def assurer_colonnes() -> None:
    moteur = create_async_engine(settings.database_url, poolclass=NullPool)
    try:
        async with moteur.begin() as conn:
            # Un ALTER attend un verrou exclusif : ne pas bloquer le demarrage
            # derriere une longue requete, l'autre service le fera.
            await conn.execute(text("SET LOCAL lock_timeout = '15s'"))
            for sql in COLONNES_AJOUTEES:
                await conn.execute(text(sql))
    except Exception as exc:
        # Table absente (premier deploiement, init_db.py pas encore lance) ou
        # ALTER concurrent de l'API et du worker : sans gravite, on continue.
        log.warning("Colonnes de la veille non verifiees", error=str(exc))
    finally:
        await moteur.dispose()
