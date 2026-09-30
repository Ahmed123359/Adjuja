"""Panneau d'administration : accès et lecture de la veille.

Voir context/feature-spec/admin-panel/api.md. Le test des routes parcourt
`admin_router` lui-même : une route ajoutée plus tard est couverte sans qu'on
pense à l'ajouter ici.
"""

import re
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_current_user, get_user_service
from app.api.routes import auth_routes
from app.api.routes.admin_routes import admin_router
from app.config.settings import get_settings
from app.main import app
from app.models.admin import DceEchecsOut, VeilleSourcesOut
from app.models.user import UserPublic
from app.services.admin import veille
from app.services.admin.acces import adresse_admin, est_admin_plateforme

ADMIN = "admin@adjuja.ma"


def _settings(admin_emails: list[str] | None = None):
    return get_settings().model_copy(update={"admin_emails": admin_emails or [ADMIN], "allowed_emails": []})


def _user(email: str, verifie: bool = True) -> UserPublic:
    return UserPublic(
        id="u1", nom="N", prenom="P", email=email,
        created_at="2026-09-30T00:00:00", email_verified=verifie,
    )


# ── Règle d'accès ────────────────────────────────────────────────────────────

class TestRegle:
    def test_adresse_de_la_liste_verifiee(self) -> None:
        assert est_admin_plateforme(_user(ADMIN), _settings())

    def test_casse_et_espaces_ignores(self) -> None:
        assert est_admin_plateforme(_user("  Admin@Adjuja.MA "), _settings([" ADMIN@adjuja.ma"]))

    def test_adresse_non_verifiee_refusee(self) -> None:
        # Le cœur de la faille corrigée : posséder la boîte est exigé.
        assert not est_admin_plateforme(_user(ADMIN, verifie=False), _settings())

    def test_adresse_hors_liste(self) -> None:
        assert not est_admin_plateforme(_user("client@exemple.ma"), _settings())

    def test_liste_vide_personne(self) -> None:
        s = get_settings().model_copy(update={"admin_emails": []})
        assert not est_admin_plateforme(_user(ADMIN), s)

    def test_adresse_vide_jamais_admin(self) -> None:
        assert not adresse_admin("", _settings(["", ADMIN]))


# ── Routes /admin/* ──────────────────────────────────────────────────────────

def _chemins_admin() -> list[tuple[str, str]]:
    chemins = []
    for route in admin_router.routes:
        chemin = "/api/v1" + re.sub(r"\{[^}]+\}", "1", route.path)
        for methode in route.methods:
            chemins.append((methode, chemin))
    return chemins


@pytest.fixture
def client():
    app.dependency_overrides[get_settings] = lambda: _settings()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_settings, None)
    app.dependency_overrides.pop(get_current_user, None)


def test_le_routeur_a_des_routes() -> None:
    # Garde-fou : un routeur vide rendrait les tests paramétrés vacuement verts.
    assert len(_chemins_admin()) >= 2


@pytest.mark.parametrize("methode,chemin", _chemins_admin())
def test_sans_jeton_401(client: TestClient, methode: str, chemin: str) -> None:
    assert client.request(methode, chemin).status_code == 401


@pytest.mark.parametrize("methode,chemin", _chemins_admin())
def test_compte_ordinaire_403(client: TestClient, methode: str, chemin: str) -> None:
    app.dependency_overrides[get_current_user] = lambda: _user("client@exemple.ma")
    assert client.request(methode, chemin).status_code == 403


@pytest.mark.parametrize("methode,chemin", _chemins_admin())
def test_admin_non_verifie_403(client: TestClient, methode: str, chemin: str) -> None:
    app.dependency_overrides[get_current_user] = lambda: _user(ADMIN, verifie=False)
    assert client.request(methode, chemin).status_code == 403


def test_admin_lit_la_veille(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(veille, "sources_veille", AsyncMock(
        return_value=VeilleSourcesOut(genere_le="2026-09-30T00:00:00+00:00", sources=[])
    ))
    monkeypatch.setattr(veille, "dce_echecs", AsyncMock(return_value=DceEchecsOut(total=0, items=[])))
    app.dependency_overrides[get_current_user] = lambda: _user(ADMIN)
    assert client.get("/api/v1/admin/veille/sources").status_code == 200
    assert client.get("/api/v1/admin/veille/dce-echecs?source=bdc").status_code == 200


def test_me_expose_le_drapeau(client: TestClient) -> None:
    app.dependency_overrides[get_current_user] = lambda: _user(ADMIN)
    assert client.get("/api/v1/auth/me").json()["is_platform_admin"] is True
    app.dependency_overrides[get_current_user] = lambda: _user("client@exemple.ma")
    assert client.get("/api/v1/auth/me").json()["is_platform_admin"] is False


# ── Inscription : plus de passe-droit pour les adresses admin ────────────────

def test_inscription_admin_passe_par_le_code(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    users = MagicMock()
    users.get_by_email = AsyncMock(return_value=None)
    users.create = AsyncMock()
    app.dependency_overrides[get_user_service] = lambda: users
    envoi = AsyncMock()
    monkeypatch.setattr(auth_routes, "send_verification_otp_email", envoi)
    try:
        r = client.post("/api/v1/auth/register", json={
            "nom": "N", "prenom": "P", "email": ADMIN, "password": "MotDePasse123",
            "entreprise": "E", "secteur_activite": "BTP",
        })
    finally:
        app.dependency_overrides.pop(get_user_service, None)
        auth_routes.cache.delete(f"pending_registration:{ADMIN}")
    assert r.status_code == 201, r.text
    assert r.json() == {"message": "otp_sent", "access_token": None}
    users.create.assert_not_awaited()
    envoi.assert_awaited_once()


# ── Remplissage de la veille (fonctions pures) ───────────────────────────────

class TestRemplissage:
    def test_pourcentage(self) -> None:
        assert veille.pourcentage(1, 3) == 33.3
        assert veille.pourcentage(0, 0) is None

    def test_effacement_detecte(self) -> None:
        # Cas du 2026-09-29 : les neufs complets, les anciens vidés.
        assert veille.alerte_remplissage(ouverts_pct=12.0, recents_pct=90.0, nb_recents=40)

    def test_taux_bas_mais_stable_sans_alerte(self) -> None:
        # Caution rarement publiée : bas partout n'est pas un défaut.
        assert not veille.alerte_remplissage(ouverts_pct=8.0, recents_pct=9.0, nb_recents=40)

    def test_trop_peu_de_recents_sans_alerte(self) -> None:
        assert not veille.alerte_remplissage(ouverts_pct=0.0, recents_pct=100.0, nb_recents=3)

    def test_aucun_ouvert_sans_alerte(self) -> None:
        assert not veille.alerte_remplissage(None, 100.0, 40)

    def test_ligne_ao(self) -> None:
        ligne = {
            "source": "marchespublics", "ouverts": 100, "recents": 20,
            "nouveaux_24h": 4, "nouveaux_7j": 20, "dce_en_echec": 2,
            "analyses_faites": 30, "a_enrichir": 5,
        }
        for nom in veille.CHAMPS_AO:
            ligne[f"o_{nom}"], ligne[f"r_{nom}"] = 80, 18
        ligne["o_budget_estime"], ligne["r_budget_estime"] = 10, 19
        s = veille.source_depuis_ligne(ligne, "ao", veille.CHAMPS_AO)
        budget = next(r for r in s.remplissage if r.champ == "budget_estime")
        ville = next(r for r in s.remplissage if r.champ == "ville")
        assert (budget.ouverts_pct, budget.recents_pct, budget.alerte) == (10.0, 95.0, True)
        assert not ville.alerte
        assert s.analyses is not None and s.analyses.a_enrichir == 5

    def test_bdc_une_seule_ligne(self) -> None:
        lignes = [{"source": "a", "ouverts": 2, "recents": 1}, {"source": "b", "ouverts": 3, "recents": 0}]
        assert veille.fusionner_bdc(lignes) == [{"source": "bdc", "ouverts": 5, "recents": 1}]
        assert veille.fusionner_bdc([]) == []

    def test_requete_sans_saisie(self) -> None:
        # Les fragments assemblés viennent tous des constantes du module.
        sql = veille.requete_sources("scraped_bdc", veille.CHAMPS_BDC, veille.OUVERT_BDC)
        assert "watcher.scraped_bdc" in sql and "NOT est_annule" in sql and ":" not in sql.replace("::", "")
