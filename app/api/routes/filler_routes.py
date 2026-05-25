"""
filler_routes.py
----------------
Routes de remplissage automatique des dossiers AO.
Les fichiers sont stockés dans MinIO (plus de stockage local temporaire).
"""

import logging
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.api.dependencies import get_current_user, get_settings
from app.config.settings import Settings
from app.models.filler import CompanyCase, FillerResult
from app.models.user import UserPublic
from app.services.filler_service import run_filler

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/filler", tags=["Remplissage dossier"])

_MAX_PDF_MB = 50


@router.post(
    "/run",
    response_model=FillerResult,
    summary="Remplir automatiquement un dossier de candidature AO",
)
async def run_filler_endpoint(
    file: Annotated[UploadFile, File(description="PDF du dossier AO")],
    company_case: Annotated[CompanyCase, Form(description="Type juridique")] = CompanyCase.SOCIETE,
    lots: Annotated[str, Form(description="Lots séparés par virgules, vide = tous")] = "",
    marche_id: Optional[str] = Form(default=None),
    current_user: UserPublic = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> FillerResult:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Seuls les fichiers PDF sont acceptés.")

    pdf_bytes = await file.read()
    size_mb   = len(pdf_bytes) / (1024 * 1024)
    if size_mb > _MAX_PDF_MB:
        raise HTTPException(status_code=400, detail=f"Fichier trop volumineux ({size_mb:.1f} Mo). Limite : {_MAX_PDF_MB} Mo.")
    if len(pdf_bytes) < 1024:
        raise HTTPException(status_code=400, detail="Fichier PDF invalide ou vide.")

    if not settings.mistral_api_key:
        raise HTTPException(status_code=503, detail="Clé API Mistral non configurée.")

    lot_numbers: list[int] = []
    if lots.strip():
        try:
            lot_numbers = [int(x.strip()) for x in lots.split(",") if x.strip()]
        except ValueError:
            raise HTTPException(status_code=400, detail="Format de lots invalide. Exemple : '1,2'")

    org_id = current_user.org_id or current_user.id
    logger.info("Filler user=%s org=%s marche=%s file=%s case=%s lots=%s size=%.1fMo",
                current_user.id, org_id, marche_id, file.filename, company_case.value, lot_numbers, size_mb)

    return await run_filler(
        pdf_bytes=pdf_bytes,
        filename=file.filename,
        company_case=company_case.value,
        lots=lot_numbers,
        api_key=settings.mistral_api_key,
        org_id=org_id,
        marche_id=marche_id or None,
    )
