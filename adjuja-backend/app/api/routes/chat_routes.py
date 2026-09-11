"""
Route POST /chat  Chat conversationnel avec RAG.

Endpoint protégé par JWT. Chaque appel reçoit l'historique complet
de la conversation et retourne la réponse du LLM enrichie par la
base de connaissances Qdrant.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from app.models.chat import ChatRequest, ChatResponse
from app.models.user import UserPublic
from app.services.chat_service import ChatService
from app.services.rag_service import RagService
from app.services.usage_service import UsageService
from app.config.settings import Settings, get_settings
from app.api.dependencies import get_current_user, get_rag_service, get_usage_service

router = APIRouter(prefix="/chat", tags=["Chat RAG"])
logger = logging.getLogger(__name__)


def get_chat_service(
    settings: Settings    = Depends(get_settings),
    rag:      RagService  = Depends(get_rag_service),
) -> ChatService:
    """Fournit une instance de ChatService avec ses dépendances."""
    return ChatService(settings=settings, rag_service=rag)


@router.post(
    "",
    response_model=ChatResponse,
    summary="Poser une question à l'assistant RAG",
    description=(
        "Reçoit l'historique complet de la conversation et retourne la réponse "
        "du LLM, enrichie par le contexte documentaire Qdrant si disponible."
    ),
)
async def chat(
    body:         ChatRequest  = ...,
    service:      ChatService  = Depends(get_chat_service),
    current_user: UserPublic   = Depends(get_current_user),
    usage:        UsageService = Depends(get_usage_service),
) -> ChatResponse:
    """
    Tour de conversation chat avec RAG.

    Codes d'erreur :
    - ``400`` : clé API manquante ou provider inconnu
    - ``504`` : timeout LLM
    - ``502`` : erreur du provider LLM
    """
    logger.info(
        "Chat  user=%s provider=%s messages=%d",
        current_user.id, body.provider.value, len(body.messages),
    )

    try:
        response = await service.chat(
            messages=body.messages,
            provider=body.provider,
            model=body.model,
        )
        await usage.add_tokens(response.tokens_used)
        return response
    except TimeoutError as e:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error("Erreur chat  user=%s erreur=%s", current_user.id, e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Erreur lors de la génération de la réponse : {e}",
        )