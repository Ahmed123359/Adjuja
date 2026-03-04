import logging
import time
from fastapi import APIRouter, Depends, HTTPException, Request, status
from app.models.generation import GenerationRequest, GenerationResult
from app.models.history import HistoryEntry
from app.models.user import UserPublic
from app.services.generation_service import GenerationService
from app.services.usage_service import UsageService
from app.services.history_service import HistoryService
from app.api.dependencies import get_generation_service, get_usage_service, get_history_service, get_current_user
from app.api.routes.defaults_routes import _load_defaults
from app.config.settings import get_settings
from app.limiter import limiter

router = APIRouter(prefix="/generate", tags=["Génération"])
logger = logging.getLogger(__name__)


@router.post(
    "",
    response_model=GenerationResult,
    summary="Générer une réponse à un appel d'offres",
    description=(
        "Prend en entrée le texte brut d'un appel d'offres et le contexte de l'entreprise, "
        "et génère une réponse structurée en utilisant le provider LLM sélectionné."
    ),
)
@limiter.limit(lambda: get_settings().rate_limit_generate)
async def generate_response(
    request:      Request,
    body:         GenerationRequest,
    service:      GenerationService = Depends(get_generation_service),
    usage:        UsageService      = Depends(get_usage_service),
    history:      HistoryService    = Depends(get_history_service),
    current_user: UserPublic        = Depends(get_current_user),
) -> GenerationResult:
    """
    Génère une réponse complète à un appel d'offres.

    Pipeline de traitement :
    1. Vérifie le rate limit par utilisateur (slowapi)
    2. Vérifie les limites de tokens et d'appels (compteurs globaux)
    3. Parse le texte brut de l'AO en objet structuré
    4. Construit un prompt optimisé avec le contexte entreprise
    5. Appelle le provider LLM choisi
    6. Incrémente le compteur d'usage
    7. Sauvegarde dans l'historique
    8. Retourne la réponse découpée en sections Markdown

    Codes d'erreur retournés :
    - ``400`` : paramètres invalides (clé API manquante, provider inconnu…)
    - ``429`` : rate limit dépassé, ou limite d'appels/tokens atteinte
    - ``502`` : échec de l'appel au provider LLM (auth, quota, timeout…)
    - ``500`` : erreur interne inattendue
    """
    # Vérification des limites globales avant génération
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

    # Injecter les instructions par défaut si le front n'en envoie pas
    if not body.instructions_supplementaires and limits.instructions:
        body = body.model_copy(update={'instructions_supplementaires': limits.instructions})

    logger.info(
        "Génération démarrée — user=%s provider=%s model=%s langue=%s",
        current_user.id, body.provider.value, body.model, body.langue,
    )
    debut = time.monotonic()

    try:
        result = await service.generate(body)
        if not result.succes:
            # Erreur remontée par le service (ex: clé API invalide, quota LLM)
            logger.error(
                "Génération échouée — user=%s provider=%s erreur=%s",
                current_user.id, body.provider.value, result.erreur,
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=result.erreur or "Erreur lors de la génération.",
            )

        duree = time.monotonic() - debut
        logger.info(
            "Génération réussie — user=%s provider=%s tokens=%d durée=%.1fs",
            current_user.id, result.provider_utilise, result.tokens_utilises or 0, duree,
        )

        usage.add(result.tokens_utilises or 0)

        # Sauvegarde dans l'historique
        history.add(HistoryEntry(
            user_id=current_user.id,
            ao_excerpt=body.ao_texte[:150].strip(),
            company_nom=body.contexte_entreprise.nom,
            provider=result.provider_utilise,
            model=result.model_utilise,
            tokens_utilises=result.tokens_utilises or 0,
            langue=body.langue,
            result=result,
        ))

        return result

    except HTTPException:
        raise
    except ValueError as e:
        logger.warning("Paramètres invalides — user=%s erreur=%s", current_user.id, e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception:
        # exc_info=True inclut la stacktrace complète dans les logs pour diagnostic
        logger.error("Erreur interne inattendue — user=%s", current_user.id, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Une erreur interne est survenue.",
        )
