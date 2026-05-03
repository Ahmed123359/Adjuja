from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator
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

    app_host: str = "0.0.0.0"  # nosec B104
    """Adresse d'écoute du serveur Uvicorn."""

    app_port: int = 8000
    """Port d'écoute du serveur Uvicorn."""

    app_debug: bool = True
    """Active le mode debug (CORS permissif, rechargement automatique)."""

    # ------------------------------------------------------------------
    # Base de données PostgreSQL
    # ------------------------------------------------------------------

    database_url: str = "postgresql+asyncpg://offria:offria@localhost:5432/offria"
    """URL de connexion PostgreSQL async. Format : postgresql+asyncpg://user:pass@host/db"""

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

    # Origines autorisées pour les requêtes cross-origin (CORS).
    # En développement (app_debug=True), ce champ est ignoré et tout est autorisé ("*").
    # En production, lister explicitement le ou les domaines du frontend.
    # Format dans .env : ALLOWED_ORIGINS=["https://monsite.com"]
    # Si vide en production, le CORS sera bloqué → le frontend ne peut pas appeler l'API.
    allowed_origins: list[str] = []
    """Origines CORS autorisées en production. Vide = bloque tout en prod."""

    # Liste blanche d'emails autorisés à s'inscrire.
    # Format dans .env : ALLOWED_EMAILS=["alice@x.com","bob@y.com"]
    # Vide = inscription ouverte à tous.
    allowed_emails: list[str] = []
    """Emails autorisés à s'inscrire. Vide = inscription ouverte."""

    # Valeur par défaut intentionnellement faible : elle est connue publiquement
    # (visible sur GitHub). En production, cette valeur DOIT être remplacée.
    # Génération d'une clé forte : openssl rand -hex 32
    jwt_secret_key: str = "change-me-in-production"
    """Clé secrète pour signer les tokens JWT. À surcharger via JWT_SECRET_KEY dans .env."""

    jwt_algorithm: str = "HS256"
    """Algorithme de signature JWT (HS256 par défaut)."""

    google_client_id: str = ""
    """Client ID Google OAuth (depuis Google Cloud Console). Vide = Google auth désactivée."""

    resend_api_key: str = ""
    """Clé API Resend pour l'envoi d'emails. Vide = vérification email désactivée (dev)."""

    app_frontend_url: str = "http://localhost:5173"
    """URL publique du frontend. Utilisée pour les redirections après vérification email."""

    admin_emails: list[str] = []
    """Emails admins : inscription sans limite de générations ni vérification email requise."""

    jwt_expire_minutes: int = 10080
    """Durée de vie des tokens JWT en minutes (défaut : 7 jours)."""

    # ------------------------------------------------------------------
    # Limites de contexte AO
    # ------------------------------------------------------------------

    ao_max_chars: int = 100000
    """Nombre maximum de caractères du texte AO injectés dans le prompt de génération.
    100 000 chars ≈ 25 000 tokens — couvre 99%+ des AOs réels (max observé ~101k chars).
    Réduire pour limiter les coûts (ex: 30000 ≈ 7500 tokens ≈ ~38% de couverture)."""

    # ------------------------------------------------------------------
    # Timeouts LLM
    # ------------------------------------------------------------------

    # Durée maximale d'un appel LLM individuel (brief ou section unique).
    # Si le provider ne répond pas dans ce délai, on lève TimeoutError
    # plutôt que de laisser la coroutine bloquer indéfiniment.
    # Valeur recommandée : 60s par appel (les sections tournent en parallèle,
    # donc le timeout total ressenti par l'utilisateur est ~60s, pas 8×60s).
    llm_timeout_seconds: float = 60.0
    """Timeout en secondes pour chaque appel LLM individuel (défaut : 60s)."""

    # ------------------------------------------------------------------
    # Rate limiting
    # ------------------------------------------------------------------

    # Nombre maximum de requêtes autorisées sur POST /generate par utilisateur.
    # Syntaxe : "<N>/<période>" — ex: "10/minute", "100/hour", "5/second".
    # Dépasse la limite → HTTP 429 Too Many Requests.
    # Valeur par défaut : 10 requêtes par minute par utilisateur.
    # À réduire en production si les coûts LLM sont une préoccupation.
    rate_limit_generate: str = "10/minute"
    """Limite de requêtes sur POST /generate par user (syntaxe slowapi : '10/minute')."""

    @model_validator(mode="after")
    def _valider_jwt_secret(self) -> "Settings":
        """
        Vérifie la sécurité de jwt_secret_key au démarrage de l'application.

        Ce validateur s'exécute UNE SEULE FOIS quand Settings() est instancié,
        c'est-à-dire au démarrage du serveur — pas à chaque requête.

        Deux règles :
        1. En production (APP_ENV=production), la clé par défaut est refusée.
           Raison : cette valeur est publique sur GitHub → n'importe qui peut forger
           des tokens valides s'il connaît la clé.

        2. La clé doit faire au moins 32 caractères dans tous les environnements.
           Raison : HS256 signe avec HMAC-SHA256. Une clé courte est vulnérable
           aux attaques par dictionnaire.

        Si une règle est violée → ValueError → l'application refuse de démarrer
        avec un message d'erreur explicite.
        """
        cle_par_defaut = "change-me-in-production"

        # Règle 1 : interdire la clé par défaut en production
        if self.app_env == "production" and self.jwt_secret_key == cle_par_defaut:
            raise ValueError(
                "\n\n"
                "  [SECURITE] JWT_SECRET_KEY est la valeur par défaut.\n"
                "  En production, cette clé est publique sur GitHub : n'importe qui\n"
                "  peut créer des tokens valides et usurper n'importe quel compte.\n\n"
                "  Solution :\n"
                "    1. Générez une clé forte : openssl rand -hex 32\n"
                "    2. Ajoutez dans votre .env de prod : JWT_SECRET_KEY=<votre_clé>\n"
            )

        # Règle 2 : longueur minimale de 32 caractères (tous environnements)
        if len(self.jwt_secret_key) < 32:
            raise ValueError(
                "\n\n"
                "  [SECURITE] JWT_SECRET_KEY est trop courte "
                f"({len(self.jwt_secret_key)} caractères, minimum : 32).\n"
                "  Une clé courte est vulnérable aux attaques par dictionnaire.\n\n"
                "  Solution : openssl rand -hex 32\n"
            )

        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
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
