"""
Tests unitaires pour worker/db.py.

Couverture :
  - init_db : création du schéma, idempotence, migration silencieuse
  - upsert_ao : insertion, mise à jour sur conflit, statuts
"""
import sqlite3

import pytest

from worker.config import WorkerSettings
from worker.db import init_db, upsert_ao
from worker.models import AOResult


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────


@pytest.fixture
def settings(tmp_path):
    """WorkerSettings pointant vers une base temporaire isolée."""
    return WorkerSettings(
        db_path=str(tmp_path / "test.db"),
        output_dir=str(tmp_path / "output"),
    )


@pytest.fixture
def conn(settings):
    """Connexion ouverte sur la base temporaire, fermée après le test."""
    c = init_db(settings)
    yield c
    c.close()


def _make_result(ref: str = "123456", fichier_path: str | None = "/tmp/test.zip") -> AOResult:
    return AOResult(
        ref_consultation=ref,
        titre=f"[REF] AO {ref}",
        url_detail=f"https://example.com/?refConsultation={ref}",
        fichier_path=fichier_path,
        reference=f"REF-{ref}",
        objet="Travaux de maintenance",
        acheteur_detail="ONCF",
        type_annonce="Annonce de consultation",
        procedure="Appel d'offres ouvert",
        categorie="Services",
        contact_nom="Jean Dupont",
        contact_email="jean@oncf.ma",
        contact_tel="05 37 77 47 47",
        date_limite="22/04/2026 09:00",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Tests init_db
# ─────────────────────────────────────────────────────────────────────────────


def test_init_db_creates_table(conn: sqlite3.Connection) -> None:
    """La table appels_offre est créée avec toutes les colonnes attendues."""
    cols = {row[1] for row in conn.execute("PRAGMA table_info(appels_offre)")}
    expected = {
        "id", "ref_consultation", "reference", "titre", "objet",
        "acheteur", "acheteur_detail", "type_annonce", "procedure",
        "categorie", "contact_nom", "contact_email", "contact_tel",
        "date_limite", "url_detail", "zip_path", "scraped_at", "statut",
    }
    assert expected.issubset(cols)


def test_init_db_enables_wal(conn: sqlite3.Connection) -> None:
    """Le mode WAL est activé pour la concurrence lecture/écriture."""
    mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
    assert mode == "wal"


def test_init_db_idempotent(settings: WorkerSettings) -> None:
    """Appeler init_db deux fois de suite ne lève pas d'erreur."""
    c1 = init_db(settings)
    c1.close()
    c2 = init_db(settings)
    c2.close()


def test_init_db_migration_adds_missing_columns(settings: WorkerSettings) -> None:
    """
    Si la table existe sans certaines colonnes (ancien schéma),
    init_db les ajoute silencieusement sans erreur.
    """
    # Schéma minimal sans les nouvelles colonnes
    conn_old = sqlite3.connect(settings.db_path)
    conn_old.execute("""
        CREATE TABLE appels_offre (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            ref_consultation TEXT UNIQUE NOT NULL,
            titre            TEXT,
            scraped_at       TEXT NOT NULL DEFAULT '',
            statut           TEXT NOT NULL DEFAULT 'disponible'
        )
    """)
    conn_old.commit()
    conn_old.close()

    # init_db doit ajouter les colonnes manquantes
    conn_new = init_db(settings)
    cols = {row[1] for row in conn_new.execute("PRAGMA table_info(appels_offre)")}
    conn_new.close()

    assert "reference" in cols
    assert "contact_email" in cols
    assert "date_limite" in cols


# ─────────────────────────────────────────────────────────────────────────────
# Tests upsert_ao
# ─────────────────────────────────────────────────────────────────────────────


def test_upsert_ao_insert_new(conn: sqlite3.Connection) -> None:
    """Un nouvel AO est inséré en base."""
    result = _make_result("111111")
    upsert_ao(conn, result, "ONCF")

    row = conn.execute(
        "SELECT * FROM appels_offre WHERE ref_consultation = ?", ("111111",)
    ).fetchone()
    assert row is not None
    assert row["titre"] == "[REF] AO 111111"
    assert row["acheteur"] == "ONCF"
    assert row["reference"] == "REF-111111"
    assert row["contact_email"] == "jean@oncf.ma"


def test_upsert_ao_statut_disponible(conn: sqlite3.Connection) -> None:
    """Un AO avec fichier_path a le statut 'disponible'."""
    result = _make_result("222222", fichier_path="/tmp/test.zip")
    upsert_ao(conn, result, "ONCF")

    row = conn.execute(
        "SELECT statut FROM appels_offre WHERE ref_consultation = ?", ("222222",)
    ).fetchone()
    assert row["statut"] == "disponible"


def test_upsert_ao_statut_erreur(conn: sqlite3.Connection) -> None:
    """Un AO sans fichier_path (échec de téléchargement) a le statut 'erreur_scraping'."""
    result = _make_result("333333", fichier_path=None)
    upsert_ao(conn, result, "ONCF")

    row = conn.execute(
        "SELECT statut FROM appels_offre WHERE ref_consultation = ?", ("333333",)
    ).fetchone()
    assert row["statut"] == "erreur_scraping"


def test_upsert_ao_update_on_conflict(conn: sqlite3.Connection) -> None:
    """
    Un second upsert sur la même ref_consultation met à jour les champs
    sans créer de doublon.
    """
    result_v1 = _make_result("444444")
    result_v1.titre = "Titre original"
    upsert_ao(conn, result_v1, "ONCF")

    result_v2 = _make_result("444444")
    result_v2.titre = "Titre mis à jour"
    upsert_ao(conn, result_v2, "ONCF")

    rows = conn.execute(
        "SELECT titre FROM appels_offre WHERE ref_consultation = ?", ("444444",)
    ).fetchall()
    assert len(rows) == 1
    assert rows[0]["titre"] == "Titre mis à jour"


def test_upsert_ao_multiple_refs(conn: sqlite3.Connection) -> None:
    """Plusieurs AOs différents coexistent en base."""
    for ref in ["555555", "666666", "777777"]:
        upsert_ao(conn, _make_result(ref), "ONCF")

    count = conn.execute("SELECT COUNT(*) FROM appels_offre").fetchone()[0]
    assert count == 3
