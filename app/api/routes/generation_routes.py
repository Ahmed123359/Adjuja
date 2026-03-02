from fastapi import APIRouter, Depends, HTTPException, status
from app.models.generation import GenerationRequest, GenerationResult
from app.services.generation_service import GenerationService
from app.services.usage_service import UsageService
from app.api.dependencies import get_generation_service, get_usage_service
from app.api.routes.defaults_routes import _load_defaults

router = APIRouter(prefix="/generate", tags=["Génération"])


@router.post(
    "",
    response_model=GenerationResult,
    summary="Générer une réponse à un appel d'offres",
    description=(
        "Prend en entrée le texte brut d'un appel d'offres et le contexte de l'entreprise, "
        "et génère une réponse structurée en utilisant le provider LLM sélectionné."
    ),
)
async def generate_response(
    request: GenerationRequest,
    service: GenerationService = Depends(get_generation_service),
    usage: UsageService = Depends(get_usage_service),
) -> GenerationResult:
    """
    Génère une réponse complète à un appel d'offres.

    Pipeline de traitement :
    1. Vérifie les limites de tokens et d'appels
    2. Parse le texte brut de l'AO en objet structuré
    3. Construit un prompt optimisé avec le contexte entreprise
    4. Appelle le provider LLM choisi
    5. Incrémente le compteur d'usage
    6. Retourne la réponse découpée en sections Markdown

    Codes d'erreur retournés :
    - ``400`` : paramètres invalides (clé API manquante, provider inconnu…)
    - ``429`` : limite d'appels ou de tokens atteinte
    - ``502`` : échec de l'appel au provider LLM (auth, quota, timeout…)
    - ``500`` : erreur interne inattendue
    """
    # Vérification des limites avant génération
    limits = _load_defaults()
    if limits.max_appels > 0 and usage.total_appels >= limits.max_appels:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Limite d'appels atteinte ({limits.max_appels} appels). Réinitialisez le compteur.",
        )
    if limits.max_tokens_cumul > 0 and usage.total_tokens >= limits.max_tokens_cumul:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Limite de tokens atteinte ({limits.max_tokens_cumul:,} tokens). Réinitialisez le compteur.",
        )

    try:
        result = await service.generate(request)
        if not result.succes:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=result.erreur or "Erreur lors de la génération.",
            )
        usage.add(result.tokens_utilises or 0)
        return result

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur interne : {str(e)}",
        )
