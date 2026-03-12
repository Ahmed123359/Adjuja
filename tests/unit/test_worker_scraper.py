"""
Tests unitaires pour les fonctions pures de worker/scraper.py.

On teste uniquement les fonctions sans Playwright (_normalize_url, _extract_ref).
Le scraping réel (run_scrape, _download_dossier) n'est pas testé ici car
il nécessite un vrai navigateur — c'est du périmètre des tests end-to-end.
"""
import pytest

from worker.scraper import _extract_ref, _normalize_url


# ─────────────────────────────────────────────────────────────────────────────
# _normalize_url
# ─────────────────────────────────────────────────────────────────────────────

BASE = "https://www.marchespublics.gov.ma"


def test_normalize_url_already_absolute() -> None:
    """Une URL déjà absolue (http/https) est retournée telle quelle."""
    url = "https://www.marchespublics.gov.ma/index.php?page=foo"
    assert _normalize_url(url) == url


def test_normalize_url_relative_with_leading_slash() -> None:
    """Une URL relative commençant par / est préfixée par BASE_URL."""
    assert _normalize_url("/index.php?page=foo") == f"{BASE}/index.php?page=foo"


def test_normalize_url_relative_without_leading_slash() -> None:
    """Une URL relative sans / est préfixée par BASE_URL/."""
    assert _normalize_url("index.php?page=foo") == f"{BASE}/index.php?page=foo"


def test_normalize_url_empty() -> None:
    """Une chaîne vide retourne une chaîne vide."""
    assert _normalize_url("") == ""


def test_normalize_url_http_preserved() -> None:
    """Les URLs http (non https) sont aussi retournées sans modification."""
    url = "http://www.marchespublics.gov.ma/index.php"
    assert _normalize_url(url) == url


# ─────────────────────────────────────────────────────────────────────────────
# _extract_ref
# ─────────────────────────────────────────────────────────────────────────────


def test_extract_ref_standard_param() -> None:
    """Extrait refConsultation depuis une URL PRADO standard."""
    url = "https://www.marchespublics.gov.ma/index.php?page=entreprise.EntrepriseDetailConsultation&refConsultation=981730"
    assert _extract_ref(url) == "981730"


def test_extract_ref_among_multiple_params() -> None:
    """Extrait refConsultation même si d'autres paramètres sont présents."""
    url = "https://example.com/?foo=bar&refConsultation=982877&baz=qux"
    assert _extract_ref(url) == "982877"


def test_extract_ref_fallback_no_param() -> None:
    """Sans refConsultation, retourne les 20 derniers chars du dernier segment."""
    url = "https://example.com/page/abcdefghij"
    result = _extract_ref(url)
    assert len(result) <= 20
    assert result == "abcdefghij"


def test_extract_ref_fallback_truncated() -> None:
    """Le fallback est tronqué à 20 caractères maximum."""
    url = "https://example.com/page=" + "x" * 30
    result = _extract_ref(url)
    assert len(result) <= 20
