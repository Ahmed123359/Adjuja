from fastapi import Depends, HTTPException, status

from app.api.dependencies import get_current_user
from app.models.user import UserPublic

_MAX_TOKENS_PER_CALL = 60_000


def check_user_quota(current_user: UserPublic = Depends(get_current_user)) -> UserPublic:
    """
    Dependency FastAPI — vérifie le quota freemium avant tout appel LLM.
    max_generations == 0 signifie compte admin (illimité).
    """
    if (
        current_user.max_generations > 0
        and current_user.generations_used >= current_user.max_generations
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Quota atteint ({current_user.max_generations} générations). "
                "Passez au plan Starter pour continuer."
            ),
        )
    return current_user


def enforce_token_ceiling(requested_tokens: int) -> None:
    """
    Vérifie qu'un appel ne dépasse pas le plafond de tokens autorisé par requête.
    Appelé avant de déclencher un pipeline LLM.
    """
    if requested_tokens > _MAX_TOKENS_PER_CALL:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Le nombre de tokens demandé ({requested_tokens:,}) dépasse la limite par appel ({_MAX_TOKENS_PER_CALL:,}).",
        )
