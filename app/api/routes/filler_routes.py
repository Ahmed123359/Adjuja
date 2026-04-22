"""
filler_routes.py
----------------
Endpoints de remplissage automatique des dossiers AO.

Routes :
    POST /api/v1/filler/run
        Reçoit un PDF + paramètres, lance le pipeline asynchrone,
        retourne un FillerResult avec les URLs de téléchargement.

    GET  /api/v1/filler/download/{job_id}/{filename}
        Télécharge un fichier produit par un traitement précédent.
        Les fichiers sont conservés pendant MAX_JOB_AGE_SECONDS puis supprimés.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.api.dependencies import get_current_user, get_settings
from app.config.settings import Settings
from app.models.filler import CompanyCase, FillerResult
from app.models.user import UserPublic
from app.services.filler_service import get_output_file_path, run_filler

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/filler", tags=["Remplissage dossier"])

_MAX_PDF_MB = 50


@router.post(
    "/run",
    response_model=FillerResult,
    summary="Remplir automatiquement un dossier de candidature AO",
)
async def run_filler_endpoint(
    file: Annotated[UploadFile, File(description="PDF du dossier AO (acte d'engagement, déclaration d'honneur, ...)")],
    company_case: Annotated[CompanyCase, Form(description="Type juridique du soumissionnaire")] = CompanyCase.SOCIETE,
    lots: Annotated[str, Form(description="Numéros de lots séparés par des virgules, ex: '1,2' (vide = tous)")] = "",
    current_user: UserPublic = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> FillerResult:
    """
    Analyse un PDF de dossier AO, détecte les documents qu'il contient
    (acte d'engagement, déclaration sur l'honneur, bordereau des prix, ...),
    et remplit automatiquement les champs vides avec les données de l'entreprise.

    Le traitement peut prendre 30–90 secondes selon la taille et la complexité du PDF.

    Retourne une liste de fichiers téléchargeables (PDF, DOCX, XLSX) par type de document détecté.
    """
    # ── Validation du fichier ────────────────────────────────────────────────
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Seuls les fichiers PDF sont acceptés.")

    pdf_bytes = await file.read()
    size_mb   = len(pdf_bytes) / (1024 * 1024)
    if size_mb > _MAX_PDF_MB:
        raise HTTPException(
            status_code=400,
            detail=f"Fichier trop volumineux ({size_mb:.1f} Mo). Limite : {_MAX_PDF_MB} Mo.",
        )
    if len(pdf_bytes) < 1024:
        raise HTTPException(status_code=400, detail="Fichier PDF invalide ou vide.")

    # ── Validation de la clé Mistral ─────────────────────────────────────────
    if not settings.mistral_api_key:
        raise HTTPException(
            status_code=503,
            detail="Clé API Mistral non configurée. Le remplissage nécessite Mistral AI.",
        )

    # ── Parse des numéros de lots ────────────────────────────────────────────
    lot_numbers: list[int] = []
    if lots.strip():
        try:
            lot_numbers = [int(x.strip()) for x in lots.split(",") if x.strip()]
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Format de lots invalide. Exemple valide : '1,2' ou '1'.",
            )

    logger.info(
        "Filler — user=%s file=%s case=%s lots=%s size=%.1fMo",
        current_user.id, file.filename, company_case.value, lot_numbers, size_mb,
    )

    # ── Lancement du pipeline ────────────────────────────────────────────────
    result = await run_filler(
        pdf_bytes=pdf_bytes,
        filename=file.filename,
        company_case=company_case.value,
        lots=lot_numbers,
        api_key=settings.mistral_api_key,
    )

    return result


@router.get(
    "/download/{job_id}/{filename}",
    summary="Télécharger un fichier produit par le remplissage",
    response_class=FileResponse,
)
async def download_filler_output(
    job_id: str,
    filename: str,
    current_user: UserPublic = Depends(get_current_user),
) -> FileResponse:
    """
    Télécharge un fichier produit par un traitement de remplissage précédent.

    Les fichiers sont conservés pendant 1 heure après leur création.
    Au-delà, ils sont supprimés automatiquement et cette route retourne 404.
    """
    # Sécurité : empêcher les path traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Nom de fichier invalide.")

    file_path = get_output_file_path(job_id, filename)
    if file_path is None:
        raise HTTPException(
            status_code=404,
            detail="Fichier introuvable. Il a peut-être expiré (durée de conservation : 1h).",
        )

    # Déduire le media type depuis l'extension
    ext_to_media = {
        "pdf":  "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }
    ext        = file_path.suffix.lstrip(".").lower()
    media_type = ext_to_media.get(ext, "application/octet-stream")

    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type=media_type,
    )
