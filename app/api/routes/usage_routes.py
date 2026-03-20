from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.services.usage_service import UsageService
from app.api.dependencies import get_usage_service
from app.api.routes.defaults_routes import _load_defaults

router = APIRouter(prefix="/usage", tags=["Compteur"])


class UsageData(BaseModel):
    total_tokens:     int
    total_appels:     int
    total_tokens_ocr: int
    max_tokens_cumul: int
    max_appels:       int


def _build_usage(usage: UsageService) -> UsageData:
    limits = _load_defaults()
    return UsageData(
        total_tokens=usage.total_tokens,
        total_appels=usage.total_appels,
        total_tokens_ocr=usage.total_tokens_ocr,
        max_tokens_cumul=limits.max_tokens_cumul,
        max_appels=limits.max_appels,
    )


@router.get(
    "",
    response_model=UsageData,
    summary="Compteur de tokens et d'appels",
)
def get_usage(usage: UsageService = Depends(get_usage_service)) -> UsageData:
    return _build_usage(usage)


@router.post(
    "/reset",
    response_model=UsageData,
    summary="Réinitialiser les compteurs",
)
def reset_usage(usage: UsageService = Depends(get_usage_service)) -> UsageData:
    usage.reset()
    return _build_usage(usage)
