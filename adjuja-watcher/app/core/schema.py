"""Tables et colonnes ajoutees apres coup au schema de la veille.

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

TABLES_AJOUTEES: tuple[str, ...] = (
    # 2026-09-30 : un enregistrement par passage de scrape et par source.
    # Jusque-la seul l'horodatage du cooldown vivait dans Redis, ecrase a
    # chaque passage : « la source X echoue depuis deux jours » etait
    # invisible. Lue par le panneau d'administration du backend
    # (context/feature-spec/admin-panel/api.md). Pas de modele ORM : rien
    # d'autre que app.core.scrape_runs n'y ecrit.
    """
    CREATE TABLE IF NOT EXISTS watcher.scrape_runs (
        id            SERIAL PRIMARY KEY,
        source        VARCHAR(50)  NOT NULL,
        debut         TIMESTAMPTZ  NOT NULL,
        fin           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        statut        VARCHAR(10)  NOT NULL CHECK (statut IN ('ok', 'erreur', 'ignore')),
        trouves       INTEGER      NOT NULL DEFAULT 0,
        enregistres   INTEGER      NOT NULL DEFAULT 0,
        erreur        TEXT,
        declenchement VARCHAR(10)  NOT NULL DEFAULT 'planifie'
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_scrape_runs_source_debut ON watcher.scrape_runs (source, debut DESC)",
)

COLONNES_AJOUTEES: tuple[str, ...] = (
    # 2026-09-30 : reference de l'avis telle que publiee (« 10012003 »),
    # distincte d'external_id (refConsultation interne du portail).
    "ALTER TABLE watcher.scraped_aos ADD COLUMN IF NOT EXISTS reference VARCHAR(255)",
)


async def assurer_colonnes() -> None:
    moteur = create_async_engine(settings.database_url, poolclass=NullPool)
    try:
        # Une transaction par groupe : un ALTER qui echoue (table des AO pas
        # encore creee) ne doit pas annuler la creation des tables neuves.
        for groupe in (TABLES_AJOUTEES, COLONNES_AJOUTEES):
            try:
                async with moteur.begin() as conn:
                    # Un ALTER attend un verrou exclusif : ne pas bloquer le
                    # demarrage derriere une longue requete, l'autre service le fera.
                    await conn.execute(text("SET LOCAL lock_timeout = '15s'"))
                    for sql in groupe:
                        await conn.execute(text(sql))
            except Exception as exc:
                # Schema absent (premier deploiement, init_db.py pas encore
                # lance) ou DDL concurrent de l'API et du worker : sans gravite.
                log.warning("Schema de la veille non verifie", error=str(exc))
    finally:
        await moteur.dispose()
