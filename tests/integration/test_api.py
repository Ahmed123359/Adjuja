import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi.testclient import TestClient
from app.main import app
from app.api.dependencies import get_generation_service
from app.models.generation import GenerationResult


@pytest.fixture
def mock_generation_service():
    service = MagicMock()
    service.generate = AsyncMock(return_value=GenerationResult(
        succes=True,
        provider_utilise="anthropic",
        model_utilise="claude-opus-4-6",
        texte_complet="## Présentation\nNotre entreprise...",
        tokens_utilises=1200,
    ))
    return service


@pytest.fixture
def client(mock_generation_service):
    app.dependency_overrides[get_generation_service] = lambda: mock_generation_service
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


class TestHealthRoutes:

    def test_root(self, client):
        response = client.get("/")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    def test_health(self, client):
        response = client.get("/health")
        assert response.status_code == 200


class TestModelsRoutes:

    def test_list_all_models(self, client):
        response = client.get("/api/v1/models")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        assert len(response.json()) > 0

    def test_list_providers(self, client):
        response = client.get("/api/v1/models/providers")
        assert response.status_code == 200
        providers = response.json()
        assert "openai" in providers
        assert "anthropic" in providers

    def test_list_models_by_provider(self, client):
        response = client.get("/api/v1/models/anthropic")
        assert response.status_code == 200
        models = response.json()
        assert all(m["provider"] == "anthropic" for m in models)


class TestGenerationRoutes:

    def test_generate_success(self, client):
        payload = {
            "ao_texte": "Marché public de développement d'une application web. " * 5,
            "provider": "anthropic",
            "model": "claude-opus-4-6",
            "contexte_entreprise": {
                "nom": "TechCorp SAS",
                "description": "ESN spécialisée en développement web",
                "expertises": ["Python", "FastAPI", "React"],
            },
        }
        response = client.post("/api/v1/generate", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["succes"] is True
        assert data["provider_utilise"] == "anthropic"

    def test_generate_ao_texte_trop_court(self, client):
        payload = {
            "ao_texte": "Court",
            "provider": "anthropic",
            "contexte_entreprise": {"nom": "TechCorp"},
        }
        response = client.post("/api/v1/generate", json=payload)
        assert response.status_code == 422  # Validation Pydantic
