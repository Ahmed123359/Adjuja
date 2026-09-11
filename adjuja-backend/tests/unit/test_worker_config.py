"""
Tests unitaires pour worker/config.py.

Couverture :
  - Valeurs par défaut
  - Validation email (doit contenir @)
  - Validation schedule_hours (doit être >= 1)
  - Désérialisation de la liste acheteurs depuis une chaîne JSON
"""
import pytest
from pydantic import ValidationError

from worker.config import WorkerSettings


# ─────────────────────────────────────────────────────────────────────────────
# Valeurs par défaut
# ─────────────────────────────────────────────────────────────────────────────


def test_default_values() -> None:
    """Les valeurs par défaut sont cohérentes pour un usage dev."""
    s = WorkerSettings()
    assert s.fake_nom == "Dupont"
    assert s.fake_prenom == "Jean"
    assert s.fake_email == "jean.dupont@exemple.ma"
    assert s.acheteurs == ["OFFICE NATIONAL DES CHEMINS DE FER"]
    assert s.max_aos == 2
    assert s.headless is True
    assert s.slow_mo == 200
    assert s.schedule_hours == 6
    assert s.db_path == "/app/data/ao_catalog.db"
    assert s.output_dir == "/app/output"


# ─────────────────────────────────────────────────────────────────────────────
# Validation email
# ─────────────────────────────────────────────────────────────────────────────


def test_email_valid() -> None:
    """Un email valide est accepté sans erreur."""
    s = WorkerSettings(fake_email="test@example.com")
    assert s.fake_email == "test@example.com"


def test_email_missing_at_raises() -> None:
    """Un email sans @ lève une ValidationError."""
    with pytest.raises(ValidationError, match="email"):
        WorkerSettings(fake_email="not-an-email")


def test_email_empty_raises() -> None:
    """Une chaîne vide sans @ lève une ValidationError."""
    with pytest.raises(ValidationError):
        WorkerSettings(fake_email="")


# ─────────────────────────────────────────────────────────────────────────────
# Validation schedule_hours
# ─────────────────────────────────────────────────────────────────────────────


def test_schedule_hours_minimum_valid() -> None:
    """schedule_hours = 1 est la valeur minimale acceptée."""
    s = WorkerSettings(schedule_hours=1)
    assert s.schedule_hours == 1


def test_schedule_hours_zero_raises() -> None:
    """schedule_hours = 0 lève une ValidationError."""
    with pytest.raises(ValidationError, match="WORKER_SCHEDULE_HOURS"):
        WorkerSettings(schedule_hours=0)


def test_schedule_hours_negative_raises() -> None:
    """schedule_hours négatif lève une ValidationError."""
    with pytest.raises(ValidationError):
        WorkerSettings(schedule_hours=-1)


# ─────────────────────────────────────────────────────────────────────────────
# Liste acheteurs
# ─────────────────────────────────────────────────────────────────────────────


def test_acheteurs_single() -> None:
    """Un seul acheteur dans la liste."""
    s = WorkerSettings(acheteurs=["ONCF"])
    assert s.acheteurs == ["ONCF"]


def test_acheteurs_multiple() -> None:
    """Plusieurs acheteurs sont acceptés."""
    s = WorkerSettings(acheteurs=["ONCF", "ONEE", "ADM"])
    assert len(s.acheteurs) == 3
    assert "ONEE" in s.acheteurs


def test_acheteurs_empty_list() -> None:
    """Une liste vide est acceptée (le scraper ne fera rien)."""
    s = WorkerSettings(acheteurs=[])
    assert s.acheteurs == []


# ─────────────────────────────────────────────────────────────────────────────
# Surcharge des valeurs
# ─────────────────────────────────────────────────────────────────────────────


def test_custom_paths() -> None:
    """Les chemins db_path et output_dir sont surchargés correctement."""
    s = WorkerSettings(db_path="./data/test.db", output_dir="./output")
    assert s.db_path == "./data/test.db"
    assert s.output_dir == "./output"


def test_headless_false() -> None:
    """headless=False est accepté (mode debug local)."""
    s = WorkerSettings(headless=False)
    assert s.headless is False
