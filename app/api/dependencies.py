from functools import lru_cache
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from app.config.settings import Settings, get_settings
from app.models.user import UserPublic
from app.services.ao_parser_service import AOParserService
from app.services.prompt_builder_service import PromptBuilderService
from app.services.generation_service import GenerationService
from app.services.rag_service import RagService
from app.services.usage_service import UsageService
from app.services.history_service import HistoryService
from app.services.user_service import UserService, get_user_service

_bearer = HTTPBearer(auto_error=False)

# Singletons — initialisés une seule fois au démarrage
_rag_instance:   RagService   | None = None
_usage_instance: UsageService | None = None


@lru_cache
def get_ao_parser() -> AOParserService:
    """Fournit l'instance singleton du service de parsing AO."""
    return AOParserService()


@lru_cache
def get_prompt_builder() -> PromptBuilderService:
    """Fournit l'instance singleton du service de construction de prompts."""
    return PromptBuilderService()


def get_rag_service(settings: Settings = Depends(get_settings)) -> RagService:
    """
    Fournit l'instance singleton du service RAG (lecture Qdrant).

    Initialise les clients Qdrant + OpenAI au premier appel.
    Aucune indexation n'est déclenchée ici — c'est le rôle du microservice rag-etl.
    Si QDRANT_URL n'est pas configuré, le service retourne des chaînes vides
    (dégradation gracieuse).
    """
    global _rag_instance
    if _rag_instance is None:
        _rag_instance = RagService(
            qdrant_url=settings.qdrant_url,
            openai_api_key=settings.openai_api_key,
        )
    return _rag_instance


def get_usage_service() -> UsageService:
    """Fournit l'instance singleton du compteur d'usage."""
    global _usage_instance
    if _usage_instance is None:
        _usage_instance = UsageService()
    return _usage_instance


@lru_cache(maxsize=1)
def get_history_service() -> HistoryService:
    """Fournit l'instance singleton du service d'historique (SQLite)."""
    return HistoryService()


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    settings: Settings = Depends(get_settings),
    users: UserService = Depends(get_user_service),
) -> UserPublic:
    """Décode le token Bearer JWT et retourne l'utilisateur authentifié."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token d'authentification manquant.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        user_id: str = payload.get("sub", "")
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide ou expiré.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = users.get_by_id(user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Utilisateur introuvable.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_generation_service(
    parser: AOParserService = Depends(get_ao_parser),
    prompt_builder: PromptBuilderService = Depends(get_prompt_builder),
    settings: Settings = Depends(get_settings),
    rag: RagService = Depends(get_rag_service),
) -> GenerationService:
    """Fournit une instance de GenerationService avec toutes ses dépendances."""
    return GenerationService(
        parser=parser,
        prompt_builder=prompt_builder,
        settings=settings,
        rag_service=rag,
    )
