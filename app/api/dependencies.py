from functools import lru_cache
from typing import Literal

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import Settings, get_settings
from app.db.base import get_db
from app.models.user import UserPublic
from app.services.ao_parser_service import AOParserService
from app.services.generation_service import GenerationService
from app.services.history_service import HistoryService
from app.services.prompt_builder_service import PromptBuilderService
from app.services.rag_service import RagService
from app.services.subscription_service import PlanLimitExceeded, SubscriptionService
from app.services.usage_service import UsageService
from app.services.user_service import UserService

_bearer = HTTPBearer(auto_error=False)

_rag_instance: RagService | None = None


@lru_cache
def get_ao_parser() -> AOParserService:
    return AOParserService()


@lru_cache
def get_prompt_builder() -> PromptBuilderService:
    return PromptBuilderService()


def get_rag_service(settings: Settings = Depends(get_settings)) -> RagService:
    global _rag_instance
    if _rag_instance is None:
        _rag_instance = RagService(
            qdrant_url=settings.qdrant_url,
            mistral_api_key=settings.mistral_api_key,
        )
    return _rag_instance


def get_usage_service(db: AsyncSession = Depends(get_db)) -> UsageService:
    return UsageService(db)


def get_history_service(db: AsyncSession = Depends(get_db)) -> HistoryService:
    return HistoryService(db)


def get_user_service(db: AsyncSession = Depends(get_db)) -> UserService:
    return UserService(db)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    settings: Settings = Depends(get_settings),
    db: AsyncSession = Depends(get_db),
) -> UserPublic:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token d'authentification manquant.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload  = jwt.decode(credentials.credentials, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        user_id: str = payload.get("sub", "")
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide ou expiré.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = await UserService(db).get_by_id(user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Utilisateur introuvable.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_subscription_service(db: AsyncSession = Depends(get_db)) -> SubscriptionService:
    return SubscriptionService(db)


def require_within_limit(counter: Literal["ao_per_month", "documents"]):
    """Dépendance à poser à côté de `Depends(get_current_user)` sur toute route
    dont l'usage est plafonné par le plan de l'org. Lève 402 (pas 429 : ce n'est
    pas un rate limit temporaire, c'est un plafond de plan qui ne se lève qu'en
    passant à un plan supérieur ou au mois suivant)."""

    async def _check(
        current_user: UserPublic = Depends(get_current_user),
        subs: SubscriptionService = Depends(get_subscription_service),
    ) -> None:
        org_id = current_user.org_id or current_user.id
        try:
            await subs.check_limit(org_id, counter)
        except PlanLimitExceeded as e:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=(
                    f"Limite de votre plan atteinte ({e.limit}). "
                    "Passez à un plan supérieur pour continuer."
                ),
            )

    return _check


def require_billing_admin(x_billing_admin_secret: str = Header(..., alias="X-Billing-Admin-Secret")) -> None:
    settings = get_settings()
    if not settings.billing_admin_secret or x_billing_admin_secret != settings.billing_admin_secret:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès refusé.")


def get_generation_service(
    parser: AOParserService = Depends(get_ao_parser),
    prompt_builder: PromptBuilderService = Depends(get_prompt_builder),
    settings: Settings = Depends(get_settings),
    rag: RagService = Depends(get_rag_service),
) -> GenerationService:
    return GenerationService(
        parser=parser,
        prompt_builder=prompt_builder,
        settings=settings,
        rag_service=rag,
    )
