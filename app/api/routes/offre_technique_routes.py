import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.api.dependencies import get_current_user
from app.config.settings import get_settings
from app.models.offre_technique import OffreTechniqueResult
from app.models.user import UserPublic
from app.services.offre_technique_service import get_output_file_path, run_offre_technique
from app.services.security.input_sanitizer import validate_upload_size

router = APIRouter(prefix="/offre-technique", tags=["Offre Technique"])
logger = logging.getLogger(__name__)

_ALLOWED_MIME = {"application/pdf", "application/octet-stream"}


@router.post(
    "/run",
    response_model=OffreTechniqueResult,
    summary="Générer une offre technique depuis un CPS",
)
async def run(
    file:         UploadFile,
    current_user: UserPublic = Depends(get_current_user),
) -> OffreTechniqueResult:
    if file.content_type not in _ALLOWED_MIME and not file.filename.endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Le fichier doit être un PDF.",
        )

    pdf_bytes = await file.read()
    validate_upload_size(pdf_bytes, "CPS")

    settings  = get_settings()
    api_key   = settings.mistral_api_key
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="MISTRAL_API_KEY non configurée.",
        )

    logger.info("OffreTechnique run — user=%s file=%s size=%d", current_user.id, file.filename, len(pdf_bytes))
    return await run_offre_technique(pdf_bytes, file.filename or "cps.pdf", api_key)


@router.get(
    "/download/{job_id}/{filename}",
    summary="Télécharger un fichier produit",
)
async def download(
    job_id:       str,
    filename:     str,
    current_user: UserPublic = Depends(get_current_user),
) -> FileResponse:
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nom de fichier invalide.")

    path = get_output_file_path(job_id, filename)
    if path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fichier introuvable.")

    media_types = {".pdf": "application/pdf", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
    media_type  = media_types.get(Path(filename).suffix, "application/octet-stream")
    return FileResponse(path=str(path), media_type=media_type, filename=filename)
