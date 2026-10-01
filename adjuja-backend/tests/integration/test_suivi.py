"""Suivi d'un dossier après dépôt : routes /ao/{id}/suivi sur base réelle.

Le calcul lui-même est couvert par tests/unit/test_attribution.py ; ici on
vérifie l'enregistrement, le classement renvoyé et le cloisonnement.
"""

import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy import delete, select

from app.config.settings import get_settings
from app.db.base import AsyncSessionLocal, engine
from app.db.models import AoOffreConcurrente, AoSuivi, AppelOffre, CompanyProfile, User
from app.main import app


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
async def dossier():
    """Deux utilisateurs seuls (deux organisations) ; un dossier au premier."""
    a, b, ao_id = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
    async with AsyncSessionLocal() as db:
        for uid in (a, b):
            db.add(User(id=uid, org_id=None, nom="N", prenom="P", email=f"{uid[:8]}@exemple.ma", hashed_pwd="x",
                        created_at=_maintenant(), email_verified=True, max_generations=0))
        await db.commit()
        db.add(CompanyProfile(id=str(uuid.uuid4()), org_id=a, created_at=_maintenant(), updated_at=_maintenant(),
                              nom_entreprise="Bureau Test SARL"))
        db.add(AppelOffre(id=ao_id, org_id=a, user_id=a, created_at=_maintenant(), updated_at=_maintenant(),
                          objet="Construction d'une école", statut="termine"))
        await db.commit()
    await engine.dispose()
    yield {"a": a, "b": b, "ao": ao_id}
    async with AsyncSessionLocal() as db:
        await db.execute(delete(AppelOffre).where(AppelOffre.id == ao_id))
        await db.execute(delete(CompanyProfile).where(CompanyProfile.org_id == a))
        await db.execute(delete(User).where(User.id.in_([a, b])))
        await db.commit()


def test_ouverture_saisie_et_classement(dossier: dict) -> None:
    h, url = _jeton(dossier["a"]), f"/api/v1/ao/{dossier['ao']}/suivi"
    with TestClient(app) as c:
        avant = c.get(url, headers=h).json()
        assert avant["ouvert"] is False and avant["classement"] is None

        # On ne saisit pas d'offres avant d'avoir marqué le dossier déposé.
        assert c.put(f"{url}/offres", json={"offres": []}, headers=h).status_code == 404

        ouvert = c.put(url, json={"nature_marche": "travaux", "estimation_mad": "1000000"}, headers=h).json()
        assert ouvert["ouvert"] and ouvert["suivi"]["date_depot"]
        # Notre offre est créée d'office, au nom de l'entreprise.
        assert [(o["nom"], o["est_nous"]) for o in ouvert["offres"]] == [("Bureau Test SARL", True)]

        # Cas de test_attribution.test_travaux_cas_complet : C (nous) gagne.
        r = c.put(f"{url}/offres", headers=h, json={"offres": [
            {"nom": "Bureau Test SARL", "est_nous": True, "montant_lu": "950000", "statut": "admis"},
            {"nom": "Alpha", "montant_lu": "1250000", "statut": "admis"},
            {"nom": "Beta", "montant_lu": "790000", "statut": "admis"},
            {"nom": "Delta", "montant_lu": "1060000", "montant_corrige": "1050000", "statut": "admis"},
            {"nom": "Phi", "montant_lu": "900000", "statut": "admis"},
        ]})
        assert r.status_code == 200, r.text
        d = r.json()
        cl = d["classement"]
        assert cl["calculable"] and cl["prix_reference"] == "983333.33" and cl["notre_rang"] == 1
        issues = {o["nom"]: o["issue"] for o in d["offres"]}
        assert issues["Alpha"] == "excessive" and issues["Beta"] == "anormalement_basse"
        assert [o["nom"] for o in d["offres"] if o["gagnante"]] == ["Bureau Test SARL"]


def test_autre_organisation_404(dossier: dict) -> None:
    url = f"/api/v1/ao/{dossier['ao']}/suivi"
    with TestClient(app) as c:
        h = _jeton(dossier["b"])
        assert c.get(url, headers=h).status_code == 404
        assert c.put(url, json={}, headers=h).status_code == 404


def test_deux_offres_nous_refusees(dossier: dict) -> None:
    url = f"/api/v1/ao/{dossier['ao']}/suivi"
    with TestClient(app) as c:
        h = _jeton(dossier["a"])
        c.put(url, json={}, headers=h)
        r = c.put(f"{url}/offres", headers=h, json={"offres": [
            {"nom": "x", "est_nous": True}, {"nom": "y", "est_nous": True},
        ]})
        assert r.status_code == 422


async def test_suppression_du_dossier_emporte_le_suivi(dossier: dict) -> None:
    with TestClient(app) as c:
        c.put(f"/api/v1/ao/{dossier['ao']}/suivi", json={}, headers=_jeton(dossier["a"]))
    await engine.dispose()
    async with AsyncSessionLocal() as db:
        await db.execute(delete(AppelOffre).where(AppelOffre.id == dossier["ao"]))
        await db.commit()
        assert await db.get(AoSuivi, dossier["ao"]) is None
        restantes = (await db.execute(select(AoOffreConcurrente).where(AoOffreConcurrente.ao_id == dossier["ao"]))).all()
        assert restantes == []
