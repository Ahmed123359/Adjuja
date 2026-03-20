import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from app.models.generation import GenerationRequest
from app.models.user import UserPublic
from app.services.generation_service import GenerationService
from app.services.usage_service import UsageService
from app.api.dependencies import get_generation_service, get_current_user, get_usage_service

router = APIRouter(prefix="/brief", tags=["Brief stratégique"])
logger = logging.getLogger(__name__)


class BriefResult(BaseModel):
    brief_strategique: str = Field(description="Brief stratégique généré par le LLM")
    provider_utilise:  str = Field(description="Provider effectivement utilisé")
    model_utilise:     str = Field(description="Modèle effectivement utilisé")
    tokens_utilises:   int = Field(description="Tokens consommés pour ce brief")


@router.post(
    "",
    response_model=BriefResult,
    summary="Générer le brief stratégique seul",
    description=(
        "Exécute uniquement la phase 1 de la génération : le brief stratégique. "
        "Retourne l'analyse des enjeux, les différenciants clés et la pondération des sections "
        "sans lancer la génération des 8 sections. "
        "Permet de valider l'angle stratégique avant de déclencher une génération complète."
    ),
)
async def generate_brief(
    body:         GenerationRequest,
    service:      GenerationService = Depends(get_generation_service),
    current_user: UserPublic        = Depends(get_current_user),
    usage:        UsageService      = Depends(get_usage_service),
) -> BriefResult:
    """
    Génère uniquement le brief stratégique.

    Codes d'erreur :
    - ``400`` : paramètres invalides (clé API manquante, provider inconnu…)
    - ``504`` : timeout LLM
    - ``502`` : erreur du provider LLM
    - ``500`` : erreur interne inattendue
    """
    logger.info(
        "Brief stratégique demandé — user=%s provider=%s model=%s",
        current_user.id, body.provider.value, body.model,
    )

    try:
        result = await service.generate_brief(body)
    except TimeoutError as e:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error("Erreur brief — user=%s erreur=%s", current_user.id, e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Erreur lors de la génération du brief : {e}",
        )

    tokens = result["tokens_utilises"]
    logger.info(
        "Brief généré — user=%s provider=%s tokens=%d",
        current_user.id, result["provider_utilise"], tokens,
    )
    usage.add_tokens(tokens)

    return BriefResult(**result)
