"""Panneau d'administration : comptes, suspension, dernière connexion, offre.

Base réelle (migrations appliquées, comme en CI). Voir
context/feature-spec/admin-panel/api.md, section 2 bis.
"""

import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy import delete

from app.config.settings import get_settings
from app.db.base import AsyncSessionLocal, engine
from app.db.models import AdminAction, Organization, Subscription, User
from app.main import app
from app.services.user_service import UserService

MDP = "MotDePasse123"


def _maintenant() -> str:
    return datetime.now(timezone.utc).isoformat()


def _jeton(user_id: str) -> dict[str, str]:
    s = get_settings()
    return {"Authorization": "Bearer " + jwt.encode({"sub": user_id}, s.jwt_secret_key, algorithm=s.jwt_algorithm)}


@pytest.fixture(autouse=True)
async def _fermer_pool():
    yield
    await engine.dispose()


@pytest.fixture
async def comptes():
    """Un administrateur et un client seul, supprimés après le test."""
    suffixe = uuid.uuid4().hex[:8]
    admin_id, client_id = str(uuid.uuid4()), str(uuid.uuid4())
    admin_email, client_email = f"admin-{suffixe}@adjuja.ma", f"client-{suffixe}@exemple.ma"
    async with AsyncSessionLocal() as db:
        for uid, email in ((admin_id, admin_email), (client_id, client_email)):
            db.add(User(
                id=uid, org_id=None, nom="Nom", prenom="Prenom", email=email,
                hashed_pwd=UserService.hash_password(MDP), created_at=_maintenant(),
                email_verified=True, max_generations=1, entreprise=f"Entreprise {suffixe}",
            ))
        await db.commit()
    # Le TestClient tourne dans sa propre boucle : ne pas lui laisser les
    # connexions ouvertes dans celle de pytest.
    await engine.dispose()
    reglages = get_settings().model_copy(update={"admin_emails": [admin_email], "allowed_emails": []})
    app.dependency_overrides[get_settings] = lambda: reglages
    yield {"admin": admin_id, "client": client_id, "client_email": client_email, "suffixe": suffixe,
           "admin_email": admin_email}
    app.dependency_overrides.pop(get_settings, None)
    async with AsyncSessionLocal() as db:
        await db.execute(delete(AdminAction).where(AdminAction.admin_user_id == admin_id))
        await db.execute(delete(Subscription).where(Subscription.org_id.in_([admin_id, client_id])))
        await db.execute(User.__table__.update().where(User.id.in_([admin_id, client_id])).values(org_id=None))
        await db.execute(delete(Organization).where(Organization.id.in_([admin_id, client_id])))
        await db.execute(delete(User).where(User.id.in_([admin_id, client_id])))
        await db.commit()


def test_connexion_enregistree_puis_suspension_bloque_tout(comptes: dict) -> None:
    with TestClient(app) as c:
        r = c.post("/api/v1/auth/login", json={"email": comptes["client_email"], "password": MDP})
        assert r.status_code == 200, r.text
        jeton = {"Authorization": f"Bearer {r.json()['access_token']}"}

        fiche = c.get(f"/api/v1/admin/comptes/{comptes['client']}", headers=_jeton(comptes["admin"])).json()
        assert fiche["membres"][0]["derniere_connexion"] is not None

        assert c.post(f"/api/v1/admin/utilisateurs/{comptes['client']}/suspendre",
                      json={"raison": "test"}, headers=_jeton(comptes["admin"])).status_code == 204
        # Le jeton émis avant la suspension n'ouvre plus rien...
        assert c.get("/api/v1/auth/me", headers=jeton).status_code == 403
        # ... et la connexion est refusée, mais seulement avec le bon mot de passe.
        assert c.post("/api/v1/auth/login", json={"email": comptes["client_email"], "password": MDP}).status_code == 403
        assert c.post("/api/v1/auth/login", json={"email": comptes["client_email"], "password": "Faux12345"}).status_code == 401

        assert c.post(f"/api/v1/admin/utilisateurs/{comptes['client']}/reactiver",
                      headers=_jeton(comptes["admin"])).status_code == 204
        assert c.get("/api/v1/auth/me", headers=jeton).status_code == 200


def test_garde_fous_suspension(comptes: dict) -> None:
    with TestClient(app) as c:
        # Se suspendre soi-même : refusé.
        r = c.post(f"/api/v1/admin/utilisateurs/{comptes['admin']}/suspendre", json={}, headers=_jeton(comptes["admin"]))
        assert r.status_code == 400
        # Un compte ordinaire n'a pas accès au panneau du tout.
        r = c.post(f"/api/v1/admin/utilisateurs/{comptes['admin']}/suspendre", json={}, headers=_jeton(comptes["client"]))
        assert r.status_code == 403


def test_liste_fiche_et_changement_d_offre(comptes: dict) -> None:
    with TestClient(app) as c:
        h = _jeton(comptes["admin"])
        page = c.get("/api/v1/admin/comptes", params={"recherche": comptes["client_email"]}, headers=h).json()
        assert page["total"] == 1
        ligne = page["items"][0]
        assert (ligne["org_id"], ligne["offre"], ligne["membres"]) == (comptes["client"], "free", 1)

        r = c.post(f"/api/v1/admin/comptes/{comptes['client']}/offre",
                   json={"plan_code": "pro", "duree_mois": 12}, headers=h)
        assert r.status_code == 200, r.text
        fiche = r.json()
        assert fiche["abonnement"]["offre"] == "pro" and fiche["abonnement"]["statut"] == "active"
        assert fiche["dossiers_mois"]["limite"] == 300

        filtre = c.get("/api/v1/admin/comptes", params={"offre": "pro", "recherche": comptes["suffixe"]}, headers=h).json()
        assert [i["org_id"] for i in filtre["items"]] == [comptes["client"]]
        journal = c.get("/api/v1/admin/actions", headers=h).json()
        assert journal[0]["action"] == "changer-offre" and journal[0]["module"] == "abonnements"


def test_tableau_de_bord_et_acces(comptes: dict) -> None:
    with TestClient(app) as c:
        h = _jeton(comptes["admin"])
        t = c.get("/api/v1/admin/tableau-de-bord", headers=h)
        assert t.status_code == 200, t.text
        assert t.json()["comptes_total"] >= 2 and len(t.json()["inscriptions_30j"]) == 30
        a = c.get("/api/v1/admin/acces", headers=h).json()
        assert a["administrateurs"] == [{
            "email": comptes["admin_email"], "compte_existe": True, "email_verifie": True,
            "derniere_connexion": None, "actif": True,
        }]
