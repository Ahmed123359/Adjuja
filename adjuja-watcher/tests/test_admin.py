"""Routes d'administration de la veille (app/modules/admin/router.py).

Sans base ni Redis : le client de test ne lance pas le cycle de vie de
l'application, les taches et le verrou sont remplaces.
"""

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.modules.admin import router as admin

SECRET = "secret-de-test-assez-long"
OK = {"X-Admin-Secret": SECRET}


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(settings, "watcher_admin_secret", SECRET)
    return TestClient(app)


@pytest.fixture
def taches(monkeypatch: pytest.MonkeyPatch) -> SimpleNamespace:
    t = SimpleNamespace(
        scrape=MagicMock(), bdc=MagicMock(), rattrapage=MagicMock(), enrichissement=MagicMock(),
        verrou=MagicMock(return_value=None), liberer=MagicMock(),
    )
    t.scrape.apply_async.return_value = SimpleNamespace(id="t-ao")
    t.bdc.apply_async.return_value = SimpleNamespace(id="t-bdc")
    monkeypatch.setattr(admin, "run_scrape_pipeline", t.scrape)
    monkeypatch.setattr(admin, "run_scrape_bdc_pipeline", t.bdc)
    monkeypatch.setattr(admin, "tache_rattraper_details", t.rattrapage)
    monkeypatch.setattr(admin, "tache_enrichir_analyses", t.enrichissement)
    monkeypatch.setattr(admin, "prendre_verrou", t.verrou)
    monkeypatch.setattr(admin, "liberer_verrou", t.liberer)
    return t


# ── Secret ───────────────────────────────────────────────────────────────────

def test_secret_valide() -> None:
    assert admin.secret_valide(SECRET, SECRET)
    assert not admin.secret_valide("autre", SECRET)
    # Secret non configure : tout est refuse, meme un en-tete vide.
    assert not admin.secret_valide("", "")


@pytest.mark.parametrize("methode,chemin", [
    ("POST", "/admin/scrape"),
    ("POST", "/admin/rattrapage-details"),
    ("POST", "/admin/enrichir-analyses"),
    ("GET", "/admin/taches/00000000-0000-0000-0000-000000000000"),
])
@pytest.mark.parametrize("entetes", [{}, {"X-Admin-Secret": "faux"}, {"X-Admin-Secret": ""}])
def test_refuse_sans_le_bon_secret(client: TestClient, taches, methode: str, chemin: str, entetes: dict) -> None:
    assert client.request(methode, chemin, headers=entetes, json={"cible": "ao"}).status_code == 403
    taches.scrape.apply_async.assert_not_called()


def test_secret_vide_cote_veille_tout_refuse(client: TestClient, taches, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "watcher_admin_secret", "")
    assert client.post("/admin/scrape", headers={"X-Admin-Secret": ""}, json={"cible": "ao"}).status_code == 403


def test_toutes_les_routes_admin_sont_protegees() -> None:
    # Garde-fou : une route ajoutee au routeur herite de la dependance.
    assert any(d.dependency is admin._exiger_secret for d in admin.router.dependencies)


# ── Actions ──────────────────────────────────────────────────────────────────

def test_scrape_trace_comme_admin(client: TestClient, taches) -> None:
    r = client.post("/admin/scrape", headers=OK, json={"cible": "bdc"})
    assert r.status_code == 200 and r.json() == {"task_id": "t-bdc", "action": "scrape-bdc"}
    taches.bdc.apply_async.assert_called_once_with(kwargs={"declenchement": "admin"})


def test_rattrapage_simulation_par_defaut(client: TestClient, taches) -> None:
    r = client.post("/admin/rattrapage-details", headers=OK, json={})
    assert r.status_code == 200
    kwargs = taches.rattrapage.apply_async.call_args.kwargs
    assert kwargs["kwargs"] == {"reel": False, "limite": None, "source": None}
    assert kwargs["task_id"] == r.json()["task_id"]


def test_deja_en_cours_409(client: TestClient, taches) -> None:
    taches.verrou.return_value = "tache-precedente"
    r = client.post("/admin/enrichir-analyses", headers=OK, json={"reel": True})
    assert r.status_code == 409
    taches.enrichissement.apply_async.assert_not_called()


def test_envoi_impossible_libere_le_verrou(client: TestClient, taches) -> None:
    taches.rattrapage.apply_async.side_effect = ConnectionError("redis")
    with pytest.raises(ConnectionError):
        client.post("/admin/rattrapage-details", headers=OK, json={})
    taches.liberer.assert_called_once_with("rattrapage-details")


@pytest.mark.parametrize("corps", [{"limite": 0}, {"source": "inconnue"}, {"reel": "peut-etre"}])
def test_parametres_invalides_422(client: TestClient, taches, corps: dict) -> None:
    assert client.post("/admin/rattrapage-details", headers=OK, json=corps).status_code == 422


def test_identifiant_de_tache_valide(client: TestClient) -> None:
    assert client.get("/admin/taches/pas-un-uuid", headers=OK).status_code == 422


# ── États ────────────────────────────────────────────────────────────────────

def test_etats_celery() -> None:
    assert admin.etat_depuis_celery("PENDING", None).etat == "en_attente"
    e = admin.etat_depuis_celery("PROGRESS", {"fait": 3, "total": 10})
    assert e.etat == "en_cours" and e.progression == {"fait": 3, "total": 10}
    assert admin.etat_depuis_celery("SUCCESS", {"a_completer": 4}).resultat == {"a_completer": 4}
    e = admin.etat_depuis_celery("FAILURE", RuntimeError("portail injoignable"))
    assert e.etat == "echec" and e.erreur == "RuntimeError: portail injoignable"
