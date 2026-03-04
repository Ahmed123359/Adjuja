import os
import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi.testclient import TestClient
from jose import jwt
from app.main import app
from app.api.dependencies import get_generation_service, get_current_user, get_history_service
from app.config.settings import get_settings
from app.models.generation import GenerationResult
from app.models.user import UserPublic


def _make_token(user_id: str = "test-user-id") -> str:
    """Génère un token JWT valide pour les tests (utilise la clé de settings)."""
    s = get_settings()
    return jwt.encode({"sub": user_id}, s.jwt_secret_key, algorithm=s.jwt_algorithm)


@pytest.fixture
def fake_user():
    return UserPublic(
        id="test-user-id",
        nom="Test",
        prenom="User",
        email="test@example.com",
        created_at="2024-01-01T00:00:00",
    )


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
def mock_history_service():
    # On mocke history_service pour éviter les écritures SQLite en test.
    # Sans ça, history.add() lève une FK constraint (user_id inexistant en DB).
    service = MagicMock()
    service.add = MagicMock()
    return service


@pytest.fixture
def client(mock_generation_service, mock_history_service, fake_user):
    # Injecte les services mockés ET l'utilisateur fictif
    app.dependency_overrides[get_generation_service] = lambda: mock_generation_service
    app.dependency_overrides[get_history_service] = lambda: mock_history_service
    app.dependency_overrides[get_current_user] = lambda: fake_user
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


_PAYLOAD = {
    "ao_texte": "Marché public de développement d'une application web. " * 5,
    "provider": "anthropic",
    "model": "claude-opus-4-6",
    "contexte_entreprise": {
        "nom": "TechCorp SAS",
        "description": "ESN spécialisée en développement web",
        "expertises": ["Python", "FastAPI", "React"],
    },
}


class TestHealthRoutes:

    def test_root_redirige(self, client):
        # GET / redirige vers /ui/ — on vérifie la redirection sans la suivre
        response = client.get("/", follow_redirects=False)
        assert response.status_code in (301, 302, 307, 308)

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
        response = client.post("/api/v1/generate", json=_PAYLOAD)
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

    def test_generate_sans_auth_retourne_401(self, mock_generation_service):
        """Sans token Bearer, la route doit retourner 401 (get_current_user non mocké)."""
        app.dependency_overrides[get_generation_service] = lambda: mock_generation_service
        with TestClient(app) as c:
            response = c.post("/api/v1/generate", json=_PAYLOAD)
        app.dependency_overrides.clear()
        assert response.status_code == 401


class TestRateLimiting:
    """
    Vérifie que le rate limiter bloque les requêtes excessives sur POST /generate.

    Stratégie de test :
    - La limite est abaissée à 3/minute (au lieu de 10) pour que les tests
      soient rapides sans avoir à envoyer 11 requêtes.
    - Le stockage en mémoire du limiter est remis à zéro avant/après chaque test
      pour éviter que les compteurs d'un test contaminent le suivant.
    - Chaque requête porte un token JWT valide so that the key function
      identifie l'utilisateur par user_id (pas par IP).
    """

    @pytest.fixture(autouse=True)
    def setup(self, mock_generation_service, mock_history_service, fake_user):
        """Configure limite basse + reset du stockage entre chaque test."""
        from app.limiter import limiter

        os.environ["RATE_LIMIT_GENERATE"] = "3/minute"
        get_settings.cache_clear()          # Force la relecture de la config
        limiter._storage.reset()            # Vide les compteurs en mémoire

        app.dependency_overrides[get_generation_service] = lambda: mock_generation_service
        app.dependency_overrides[get_history_service] = lambda: mock_history_service
        app.dependency_overrides[get_current_user] = lambda: fake_user

        yield

        app.dependency_overrides.clear()
        del os.environ["RATE_LIMIT_GENERATE"]
        get_settings.cache_clear()
        limiter._storage.reset()

    @staticmethod
    def _auth(user_id: str = "test-user-id") -> dict:
        return {"Authorization": f"Bearer {_make_token(user_id)}"}

    def test_sous_la_limite_passe(self):
        """3 requêtes sous la limite de 3/minute → toutes retournent 200."""
        with TestClient(app) as client:
            for i in range(3):
                r = client.post("/api/v1/generate", json=_PAYLOAD, headers=self._auth())
                assert r.status_code == 200, f"Requête {i + 1} : attendu 200, reçu {r.status_code}"

    def test_depasse_la_limite_retourne_429(self):
        """4 requêtes avec limite 3/minute → la 4e doit retourner 429."""
        with TestClient(app) as client:
            for i in range(3):
                r = client.post("/api/v1/generate", json=_PAYLOAD, headers=self._auth())
                assert r.status_code == 200, f"Requête {i + 1} : attendu 200, reçu {r.status_code}"

            # 4e requête → dépasse la limite
            r = client.post("/api/v1/generate", json=_PAYLOAD, headers=self._auth())
            assert r.status_code == 429

    def test_users_differents_ont_compteurs_independants(self, mock_generation_service):
        """User A épuise sa limite (429) → User B a toujours son quota intact."""
        user_b = UserPublic(
            id="user-b", nom="B", prenom="B",
            email="b@test.com", created_at="2024-01-01T00:00:00",
        )

        with TestClient(app) as client:
            # User A épuise ses 3 requêtes
            for _ in range(3):
                client.post("/api/v1/generate", json=_PAYLOAD, headers=self._auth("user-a"))

            # User A est maintenant bloqué
            r = client.post("/api/v1/generate", json=_PAYLOAD, headers=self._auth("user-a"))
            assert r.status_code == 429

            # User B a son propre compteur — pas encore touché
            app.dependency_overrides[get_current_user] = lambda: user_b
            r = client.post("/api/v1/generate", json=_PAYLOAD, headers=self._auth("user-b"))
            assert r.status_code == 200
