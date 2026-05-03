import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from pydantic import BaseModel
from app.api.dependencies import get_current_user, get_usage_service
from app.models.user import UserPublic
from app.services.pdf_extract_service import PdfExtractService
from app.services.usage_service import UsageService
from app.config.settings import get_settings

router = APIRouter(prefix="/pdf", tags=["PDF"])
logger = logging.getLogger(__name__)

_MAX_PDF_SIZE_MB = 20


class PdfExtractResponse(BaseModel):
    text:       str
    method:     str   # "pymupdf" | "gpt4o_vision"
    pages:      int
    is_scanned: bool


@router.post(
    "/extract",
    response_model=PdfExtractResponse,
    summary="Extraire le texte d'un AO en PDF",
    description=(
        "Accepte un fichier PDF (AO). Tente d'abord une extraction directe du texte embarqué "
        "(pymupdf). Si le PDF est scanné (images), bascule automatiquement sur GPT-4o vision "
        "pour l'OCR. Retourne le texte brut prêt à être collé dans le champ AO."
    ),
)
async def extract_pdf(
    file:         UploadFile       = File(..., description="Fichier PDF de l'appel d'offres"),
    current_user: UserPublic       = Depends(get_current_user),
    usage:        UsageService     = Depends(get_usage_service),
) -> PdfExtractResponse:
    """
    Extrait le texte d'un PDF d'appel d'offres.

    Codes d'erreur :
    - ``400`` : fichier non PDF, trop volumineux, ou PDF corrompu
    - ``422`` : PDF scanné sans clé OpenAI configurée
    - ``500`` : erreur interne inattendue
    """
    # Validation du type MIME
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Seuls les fichiers PDF sont acceptés.",
        )

    pdf_bytes = await file.read()

    # Limite de taille
    size_mb = len(pdf_bytes) / (1024 * 1024)
    if size_mb > _MAX_PDF_SIZE_MB:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Fichier trop volumineux ({size_mb:.1f} MB). Limite : {_MAX_PDF_SIZE_MB} MB.",
        )

    logger.info(
        "Extraction PDF — user=%s fichier=%s taille=%.1fMB",
        current_user.id, file.filename, size_mb,
    )

    settings = get_settings()
    service  = PdfExtractService(openai_api_key=settings.openai_api_key)

    try:
        result = await service.extract(pdf_bytes)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except Exception as e:
        logger.error("Erreur extraction PDF — user=%s erreur=%s", current_user.id, e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Impossible d'extraire le texte du PDF : {e}",
        )

    if result.tokens_ocr > 0:
        await usage.add_ocr_tokens(result.tokens_ocr)
        logger.info(
            "OCR GPT-4o — user=%s pages=%d tokens_ocr=%d",
            current_user.id, result.pages, result.tokens_ocr,
        )
    else:
        logger.info(
            "Extraction PDF réussie — user=%s méthode=%s pages=%d",
            current_user.id, result.method, result.pages,
        )

    return PdfExtractResponse(
        text=result.text,
        method=result.method,
        pages=result.pages,
        is_scanned=result.is_scanned,
    )
