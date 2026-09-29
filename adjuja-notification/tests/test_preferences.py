"""Enregistrement des preferences : pas d'activation sans secteur."""

from fastapi.testclient import TestClient

from app.api.router import _require_jwt
from app.main import app

ORG = "org-test"


def _client() -> TestClient:
    app.dependency_overrides[_require_jwt] = lambda: ORG
    return TestClient(app)


def _corps(**champs) -> dict:
    base = {"enabled": True, "secteur_codes": [], "notify_bdc": False, "cadence_unit": "day",
            "cadence_value": 1, "send_hour": 10, "max_items": 10}
    base.update(champs)
    return base


def test_activation_sans_secteur_refusee():
    # Refus avant tout acces a la base : aucune base necessaire pour ce test.
    try:
        reponse = _client().put(f"/preferences/{ORG}", json=_corps())
    finally:
        app.dependency_overrides.clear()
    assert reponse.status_code == 400
    assert "au moins un secteur" in reponse.json()["detail"]
