import logging
from typing import Optional

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, status
from fastapi.responses import RedirectResponse

from app.api.dependencies import get_current_user
from app.config.settings import get_settings
from app.models.offre_technique import OffreTechniqueResult
from app.models.user import UserPublic
from app.services.offre_technique_service import get_presigned_url, run_offre_technique
from app.services.security.input_sanitizer import (
    sanitize_custom_instructions, validate_logo, validate_upload_size,
)

router = APIRouter(prefix="/offre-technique", tags=["Offre Technique"])
logger = logging.getLogger(__name__)

_ALLOWED_MIME = {"application/pdf", "application/octet-stream"}


@router.post(
    "/run",
    response_model=OffreTechniqueResult,
    summary="Générer une offre technique depuis un CPS",
)
async def run(
    file:                 UploadFile,
    brand_color:          Optional[str]        = Form(default=None),
    custom_instructions:  Optional[str]        = Form(default=None),
    marche_id:            Optional[str]        = Form(default=None),
    logo:                 Optional[UploadFile] = None,
    rc:                   Optional[UploadFile] = None,
    current_user:         UserPublic           = Depends(get_current_user),
) -> OffreTechniqueResult:
    if file.content_type not in _ALLOWED_MIME and not file.filename.endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Le fichier doit etre un PDF.",
        )

    pdf_bytes = await file.read()
    validate_upload_size(pdf_bytes, "CPS")

    # Logo validation
    logo_bytes: bytes | None = None
    logo_filename: str | None = None
    if logo and logo.filename:
        logo_bytes = await logo.read()
        validate_logo(logo_bytes, logo.filename)
        logo_filename = logo.filename

    # Custom instructions sanitization
    clean_instructions: str | None = None
    if custom_instructions and custom_instructions.strip():
        clean_instructions = sanitize_custom_instructions(custom_instructions)

    # Brand color basic validation (#RRGGBB)
    clean_color: str | None = None
    if brand_color and brand_color.strip():
        import re
        if re.fullmatch(r"#[0-9A-Fa-f]{6}", brand_color.strip()):
            clean_color = brand_color.strip()

    settings = get_settings()
    api_key  = settings.mistral_api_key
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="MISTRAL_API_KEY non configurée.",
        )

    rc_bytes: bytes | None = None
    if rc and rc.filename and rc.filename.endswith(".pdf"):
        rc_bytes = await rc.read()
        validate_upload_size(rc_bytes, "RC")

    org_id = current_user.org_id or current_user.id
    logger.info("OffreTechnique run - user=%s org=%s marche=%s file=%s rc=%s", current_user.id, org_id, marche_id, file.filename, bool(rc_bytes))
    return await run_offre_technique(
        pdf_bytes, file.filename or "cps.pdf", api_key,
        org_id=org_id,
        logo_bytes=logo_bytes, logo_filename=logo_filename,
        brand_color=clean_color, custom_instructions=clean_instructions,
        rc_bytes=rc_bytes,
        marche_id=marche_id or None,
        user_id=current_user.id,
    )


@router.get(
    "/download/{job_id}/{filename}",
    summary="Obtenir une URL de telechargement (presigned MinIO)",
)
async def download(
    job_id:       str,
    filename:     str,
    current_user: UserPublic = Depends(get_current_user),
) -> RedirectResponse:
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nom de fichier invalide.")

    org_id = current_user.org_id or current_user.id
    url = get_presigned_url(org_id, job_id, filename)
    if url is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fichier introuvable.")

    return RedirectResponse(url=url, status_code=302)
