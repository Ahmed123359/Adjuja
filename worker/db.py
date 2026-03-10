"""
Couche de persistance du worker de scraping.

Responsabilités :
  - Initialisation du schéma SQLite (CREATE TABLE IF NOT EXISTS)
  - Migration silencieuse si la table existait avec un ancien schéma
  - Upsert d'un AOResult (INSERT OR UPDATE)

Cette couche ne contient AUCUNE logique de scraping.
"""
import logging
import sqlite3
from datetime import datetime
from pathlib import Path

from .config import WorkerSettings
from .models import AOResult

logger = logging.getLogger(__name__)

# Colonnes ajoutées après le schéma initial (migration automatique).
# Ajouter ici toute nouvelle colonne : elle sera créée si absente.
_MIGRATION_COLUMNS: list[tuple[str, str]] = [
    ("reference",       "TEXT"),
    ("objet",           "TEXT"),
    ("acheteur_detail", "TEXT"),
    ("type_annonce",    "TEXT"),
    ("procedure",       "TEXT"),
    ("categorie",       "TEXT"),
    ("contact_nom",     "TEXT"),
    ("contact_email",   "TEXT"),
    ("contact_tel",     "TEXT"),
]


def init_db(settings: WorkerSettings) -> sqlite3.Connection:
    """
    Ouvre (ou crée) la base SQLite et s'assure que le schéma est à jour.

    - Crée la table appels_offre si elle n'existe pas.
    - Ajoute silencieusement les colonnes manquantes (migrations non destructives).

    Retourne une connexion sqlite3 avec row_factory=sqlite3.Row.
    """
    db_path = Path(settings.db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    # Activer les foreign keys et le mode WAL (meilleure concurrence lecture/écriture)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")

    conn.execute("""
        CREATE TABLE IF NOT EXISTS appels_offre (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            ref_consultation TEXT    UNIQUE NOT NULL,  -- ID interne PRADO (ex: "981730")
            reference        TEXT,                     -- Réf AO (ex: "25S038")
            titre            TEXT,                     -- Titre court
            objet            TEXT,                     -- Description complète
            acheteur         TEXT,                     -- Filtre acheteur (ex: "ONCF")
            acheteur_detail  TEXT,                     -- Acheteur complet page détail
            type_annonce     TEXT,                     -- ex: "Annonce de consultation"
            procedure        TEXT,                     -- ex: "Appel d'offres ouvert"
            categorie        TEXT,                     -- ex: "Services"
            contact_nom      TEXT,                     -- Contact administratif nom
            contact_email    TEXT,                     -- Contact administratif email
            contact_tel      TEXT,                     -- Contact administratif tél
            date_limite      TEXT,                     -- ex: "22/04/2026 09:00"
            url_detail       TEXT,                     -- URL fiche complète
            zip_path         TEXT,                     -- Chemin local du ZIP
            scraped_at       TEXT    NOT NULL,         -- ISO 8601
            statut           TEXT    NOT NULL          -- 'disponible' | 'erreur_scraping'
                             DEFAULT 'disponible'
        )
    """)

    # Migration silencieuse : ajouter les colonnes absentes
    existing_cols = {row[1] for row in conn.execute("PRAGMA table_info(appels_offre)")}
    for col_name, col_type in _MIGRATION_COLUMNS:
        if col_name not in existing_cols:
            conn.execute(f"ALTER TABLE appels_offre ADD COLUMN {col_name} {col_type}")
            logger.info("Migration : colonne '%s' ajoutée", col_name)

    conn.commit()
    logger.info("Base de données prête : %s", db_path)
    return conn


def upsert_ao(
    conn: sqlite3.Connection,
    result: AOResult,
    acheteur: str,
) -> None:
    """
    Insère un AOResult en base ou met à jour la ligne existante.

    En cas de conflit sur ref_consultation (re-scraping), toutes les colonnes
    sont mises à jour sauf l'id. L'acheteur fixe (filtre de recherche) est
    passé séparément car il n'est pas dans AOResult.
    """
    statut = "disponible" if result.fichier_path else "erreur_scraping"

    try:
        conn.execute(
            """
            INSERT INTO appels_offre (
                ref_consultation, reference, titre, objet,
                acheteur, acheteur_detail, type_annonce, procedure,
                categorie, contact_nom, contact_email, contact_tel,
                date_limite, url_detail, zip_path, scraped_at, statut
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(ref_consultation) DO UPDATE SET
                reference       = excluded.reference,
                titre           = excluded.titre,
                objet           = excluded.objet,
                acheteur_detail = excluded.acheteur_detail,
                type_annonce    = excluded.type_annonce,
                procedure       = excluded.procedure,
                categorie       = excluded.categorie,
                contact_nom     = excluded.contact_nom,
                contact_email   = excluded.contact_email,
                contact_tel     = excluded.contact_tel,
                date_limite     = excluded.date_limite,
                zip_path        = excluded.zip_path,
                scraped_at      = excluded.scraped_at,
                statut          = excluded.statut
            """,
            (
                result.ref_consultation,
                result.reference,
                result.titre,
                result.objet,
                acheteur,
                result.acheteur_detail,
                result.type_annonce,
                result.procedure,
                result.categorie,
                result.contact_nom,
                result.contact_email,
                result.contact_tel,
                result.date_limite,
                result.url_detail,
                result.fichier_path,
                datetime.now().isoformat(timespec="seconds"),
                statut,
            ),
        )
        conn.commit()
        logger.debug("Upsert OK : ref=%s statut=%s", result.ref_consultation, statut)
    except sqlite3.Error as exc:
        logger.error(
            "Erreur DB lors de l'upsert ref=%s : %s",
            result.ref_consultation,
            exc,
        )
        raise
