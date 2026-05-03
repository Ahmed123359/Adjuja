from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.dependencies import get_usage_service
from app.api.routes.defaults_routes import _load_defaults
from app.services.usage_service import UsageService

router = APIRouter(prefix="/usage", tags=["Compteur"])


class UsageData(BaseModel):
    total_tokens:     int
    total_appels:     int
    total_tokens_ocr: int
    max_tokens_cumul: int
    max_appels:       int


async def _build_usage(usage: UsageService) -> UsageData:
    totals = await usage.get_totals()
    limits = _load_defaults()
    return UsageData(
        total_tokens=totals["total_tokens"],
        total_appels=totals["total_appels"],
        total_tokens_ocr=totals["total_tokens_ocr"],
        max_tokens_cumul=limits.max_tokens_cumul,
        max_appels=limits.max_appels,
    )


@router.get("", response_model=UsageData, summary="Compteur de tokens et d'appels")
async def get_usage(usage: UsageService = Depends(get_usage_service)) -> UsageData:
    return await _build_usage(usage)


@router.post("/reset", response_model=UsageData, summary="Réinitialiser les compteurs")
async def reset_usage(usage: UsageService = Depends(get_usage_service)) -> UsageData:
    await usage.reset()
    return await _build_usage(usage)
