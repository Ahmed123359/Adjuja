"""
filler_routes.py
----------------
Remplissage automatique des dossiers AO (mode background Celery).
"""
import logging
import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select

from app.api.dependencies import get_current_user, get_settings
from app.config.settings import Settings
from app.db.base import AsyncSessionLocal
from app.db.models import CompanyProfile
from app.models.user import UserPublic
from app.storage import minio_client as mc
from app.tasks.tools_tasks import task_run_filler, get_job, set_job

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/filler", tags=["Remplissage dossier"])

_MAX_PDF_MB = 50

_FORME_MAP: list[tuple[list[str], str]] = [
    (["auto", "entrepreneur"],                         "auto_entrepreneur"),
    (["coopérative", "cooperative", "coop"],           "cooperative"),
    (["établissement public", "etablissement public"], "etablissement_public"),
    (["groupement"],                                   "groupement"),
    (["personne physique", "physique"],                "personne_physique"),
]


def _derive_case(forme: str) -> str:
    f = (forme or "").lower().strip()
    for keywords, case in _FORME_MAP:
        if any(k in f for k in keywords):
            return case
    return "societe"


async def _get_company_case(org_id: str) -> str:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(CompanyProfile.forme_juridique).where(CompanyProfile.org_id == org_id)
        )
        forme = result.scalar_one_or_none() or ""
    return _derive_case(forme)


@router.post("/start")
async def filler_start(
    file: Annotated[UploadFile, File(description="PDF du dossier AO")],
    lots: Annotated[str, Form()] = "",
    marche_id: Optional[str] = Form(default=None),
    current_user: UserPublic = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Lance le remplissage en background. Retourne {job_id} immédiatement."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Seuls les fichiers PDF sont acceptés.")

    pdf_bytes = await file.read()
    size_mb = len(pdf_bytes) / (1024 * 1024)
    if size_mb > _MAX_PDF_MB:
        raise HTTPException(status_code=400, detail=f"Fichier trop volumineux ({size_mb:.1f} Mo). Limite : {_MAX_PDF_MB} Mo.")
    if len(pdf_bytes) < 1024 or not pdf_bytes.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Fichier PDF invalide.")

    if not settings.mistral_api_key:
        raise HTTPException(status_code=503, detail="Clé API Mistral non configurée.")

    lot_numbers: list[int] = []
    if lots.strip():
        try:
            lot_numbers = [int(x.strip()) for x in lots.split(",") if x.strip()]
        except ValueError:
            raise HTTPException(status_code=400, detail="Format de lots invalide. Exemple : '1,2'")

    org_id = current_user.org_id or current_user.id
    company_case = await _get_company_case(org_id)
    job_id = uuid.uuid4().hex

    # Upload PDF en MinIO (temp)
    pdf_key = f"{org_id}/tools/filler/{job_id}/input.pdf"
    mc.upload_bytes(pdf_key, pdf_bytes, "application/pdf")

    set_job(job_id, {"status": "pending", "type": "filler", "org_id": org_id})

    task_run_filler.delay(
        job_id=job_id,
        org_id=org_id,
        pdf_key=pdf_key,
        filename=file.filename,
        company_case=company_case,
        lots=lot_numbers,
        api_key=settings.mistral_api_key,
        marche_id=marche_id or None,
    )

    logger.info("Filler job started job=%s org=%s file=%s case=%s lots=%s",
                job_id, org_id, file.filename, company_case, lot_numbers)

    return {"job_id": job_id, "status": "pending"}


@router.get("/status/{job_id}")
async def filler_status(
    job_id: str,
    current_user: UserPublic = Depends(get_current_user),
) -> dict:
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job introuvable ou expiré.")

    org_id = current_user.org_id or current_user.id
    if job.get("org_id") != org_id:
        raise HTTPException(status_code=403, detail="Accès refusé.")

    response: dict = {"job_id": job_id, "status": job["status"]}

    if job["status"] == "done":
        response["result"] = job.get("result")

    if job["status"] == "failed":
        response["error"] = job.get("error", "Erreur inconnue.")

    return response


@router.delete("/cancel/{job_id}")
async def filler_cancel(
    job_id: str,
    current_user: UserPublic = Depends(get_current_user),
) -> dict:
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job introuvable.")

    org_id = current_user.org_id or current_user.id
    if job.get("org_id") != org_id:
        raise HTTPException(status_code=403, detail="Accès refusé.")

    celery_task_id = job.get("celery_task_id")
    if celery_task_id:
        from app.celery_app import celery_app
        celery_app.control.revoke(celery_task_id, terminate=True)

    set_job(job_id, {**job, "status": "cancelled"})
    return {"job_id": job_id, "status": "cancelled"}
