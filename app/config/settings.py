from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    """
    Configuration centralisée de l'application, chargée depuis les variables d'environnement.

    Les valeurs sont lues automatiquement depuis le fichier `.env` à la racine du projet
    (via pydantic-settings). Chaque attribut correspond à une variable d'environnement
    du même nom (insensible à la casse).

    Exemple de fichier `.env` :
        ANTHROPIC_API_KEY=sk-ant-...
        OPENAI_API_KEY=sk-...
        MISTRAL_API_KEY=...
        DEFAULT_PROVIDER=anthropic
        APP_PORT=8000
    """

    # ------------------------------------------------------------------
    # Clés API des providers LLM
    # ------------------------------------------------------------------

    openai_api_key: str = ""
    """Clé API OpenAI. Obligatoire si le provider 'openai' est utilisé."""

    anthropic_api_key: str = ""
    """Clé API Anthropic. Obligatoire si le provider 'anthropic' est utilisé."""

    mistral_api_key: str = ""
    """Clé API Mistral AI. Obligatoire si le provider 'mistral' est utilisé."""

    # ------------------------------------------------------------------
    # Valeurs par défaut de génération
    # ------------------------------------------------------------------

    default_provider: str = "anthropic"
    """Provider LLM utilisé par défaut si aucun n'est spécifié dans la requête."""

    default_model: str = "claude-opus-4-6"
    """Modèle LLM utilisé par défaut si aucun n'est spécifié dans la requête."""

    # ------------------------------------------------------------------
    # Configuration du serveur FastAPI
    # ------------------------------------------------------------------

    app_env: str = "development"
    """Environnement d'exécution : 'development' ou 'production'."""

    app_host: str = "0.0.0.0"
    """Adresse d'écoute du serveur Uvicorn."""

    app_port: int = 8000
    """Port d'écoute du serveur Uvicorn."""

    app_debug: bool = True
    """Active le mode debug (CORS permissif, rechargement automatique)."""

    # ------------------------------------------------------------------
    # RAG — base de données vectorielle Qdrant
    # ------------------------------------------------------------------

    qdrant_url: str = ""
    """URL du serveur Qdrant (ex: http://qdrant:6333). Vide = RAG désactivé."""

    rag_etl_url: str = ""
    """URL interne du microservice RAG ETL (ex: http://rag-etl:8001). Vide = pas de proxy."""

    # ------------------------------------------------------------------
    # Authentification JWT
    # ------------------------------------------------------------------

    jwt_secret_key: str = "change-me-in-production"
    """Clé secrète pour signer les tokens JWT. À surcharger via JWT_SECRET_KEY dans .env."""

    jwt_algorithm: str = "HS256"
    """Algorithme de signature JWT (HS256 par défaut)."""

    jwt_expire_minutes: int = 10080
    """Durée de vie des tokens JWT en minutes (défaut : 7 jours)."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


@lru_cache
def get_settings() -> Settings:
    """
    Retourne l'instance unique de configuration (pattern Singleton via cache LRU).

    Le décorateur `@lru_cache` garantit que le fichier `.env` n'est lu qu'une seule
    fois au démarrage de l'application, peu importe le nombre d'appels.

    Returns:
        L'instance singleton de Settings.

    Note:
        En test, vider le cache avec `get_settings.cache_clear()` avant de
        surcharger les variables d'environnement.
    """
    return Settings()
