"""
Routes RAG de l'application principale.

GET  /api/v1/rag/status   interroge Qdrant directement (stats de la collection)
POST /api/v1/rag/index    proxie vers le microservice rag-etl pour déclencher l'ETL

Le service principal ne fait jamais d'indexation  il délègue au rag-etl.
"""
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from app.api.dependencies import get_current_user, get_rag_service
from app.config.settings import Settings, get_settings
from app.models.user import UserPublic
from app.services.rag_service import RagService, DOCUMENT_TYPES

router = APIRouter(prefix="/rag", tags=["RAG"])

_ETL_TIMEOUT = 300.0  # 5 minutes max pour une reindexation complète


class RagStatus(BaseModel):
    ready:          bool
    doc_count:      int
    chunk_count:    int
    document_types: dict[str, str]
    etl_available:  bool = False


@router.get(
    "/status",
    response_model=RagStatus,
    summary="Statut de la base de connaissances RAG",
    description=(
        "Interroge Qdrant directement pour obtenir les statistiques de la collection. "
        "Vérifie également si le service ETL rag-etl est joignable."
    ),
)
async def rag_status(
    service: RagService = Depends(get_rag_service),
    settings: Settings = Depends(get_settings),
) -> RagStatus:
    """Retourne le nombre de vecteurs dans Qdrant + disponibilité du service ETL."""
    stats = await service.get_collection_stats()

    etl_available = False
    if settings.rag_etl_url:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                r = await client.get(f"{settings.rag_etl_url}/health")
                etl_available = r.status_code == 200
        except Exception:
            pass

    vectors_count = stats.get("vectors_count", 0)
    return RagStatus(
        ready=stats.get("available", False) and vectors_count > 0,
        doc_count=0,           # inconnu sans appel au manifest rag-etl
        chunk_count=vectors_count,
        document_types=DOCUMENT_TYPES,
        etl_available=etl_available,
    )


@router.post(
    "/index",
    summary="Déclencher l'indexation ETL",
    description=(
        "Proxie la requête vers le microservice rag-etl qui se chargera d'indexer "
        "les nouveaux fichiers de knowledge_base/. "
        "Retourne une erreur 503 si le service rag-etl n'est pas disponible."
    ),
)
async def rag_index(
    settings: Settings = Depends(get_settings),
    _user: UserPublic = Depends(get_current_user),
) -> dict:
    """Proxie POST /index vers rag-etl et retourne son rapport."""
    if not settings.rag_etl_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Service RAG ETL non configuré. "
                "Définissez RAG_ETL_URL dans votre .env "
                "(ex: RAG_ETL_URL=http://rag-etl:8001) et démarrez le service."
            ),
        )

    try:
        async with httpx.AsyncClient(timeout=_ETL_TIMEOUT) as client:
            response = await client.post(f"{settings.rag_etl_url}/index")
            return response.json()
    except httpx.ConnectError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Service RAG ETL non disponible à {settings.rag_etl_url}. Vérifiez que le container rag-etl est démarré.",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Erreur lors de l'appel au service ETL : {exc}",
        )
