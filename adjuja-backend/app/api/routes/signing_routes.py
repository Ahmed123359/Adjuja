import logging
import re
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select

from app.api.dependencies import get_current_user
from app.db.base import AsyncSessionLocal
from app.db.models import CompanyProfile
from app.models.user import UserPublic
from app.storage import minio_client as mc
from app.tasks.tools_tasks import task_sign_pdf, get_job, set_job

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/sign", tags=["Signature"])

_UNSAFE = re.compile(r"[^\w\-]")


def _safe(name: str | None) -> str:
    from pathlib import Path
    stem = Path(name or "document").stem
    return _UNSAFE.sub("_", stem)[:80] or "document"


async def _profile_keys(org_id: str) -> tuple[str | None, str | None]:
    """Retourne (signature_minio_key, cachet_minio_key) du profil company."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(
                CompanyProfile.signature_minio_key,
                CompanyProfile.cachet_minio_key,
            ).where(CompanyProfile.org_id == org_id)
        )
        row = result.one_or_none()
        if row:
            return row.signature_minio_key, row.cachet_minio_key
        return None, None


@router.post("/start")
async def sign_start(
    pdf: UploadFile = File(...),
    signature: Optional[UploadFile] = File(None),
    cachet: Optional[UploadFile] = File(None),
    sig_w:       int = Form(120),
    sig_h:       int = Form(50),
    sig_mx:      int = Form(50),
    sig_my:      int = Form(40),
    cac_w:       int = Form(100),
    cac_h:       int = Form(100),
    cac_mx:      int = Form(50),
    cac_my:      int = Form(40),
    fait_a_lieu: str = Form(""),
    fait_a_date: str = Form(""),
    paraphe_mode: bool = Form(False),
    current_user: UserPublic = Depends(get_current_user),
) -> dict:
    """Lance la signature en background. Retourne {job_id} pour polling."""
    pdf_bytes = await pdf.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="PDF vide.")

    org_id = current_user.org_id or current_user.id
    job_id = uuid.uuid4().hex

    # Upload PDF input en MinIO (temp)
    pdf_key = f"{org_id}/tools/signing/{job_id}/input.pdf"
    mc.upload_bytes(pdf_key, pdf_bytes, "application/pdf")

    # Signature : fichier uploade > profil company > None (rien d'appose)
    sig_key: str | None = None
    if signature and signature.size:
        sig_bytes = await signature.read()
        sig_key = f"{org_id}/tools/signing/{job_id}/sig{_ext(signature.filename)}"
        mc.upload_bytes(sig_key, sig_bytes, signature.content_type or "image/png")

    cac_key: str | None = None
    if cachet and cachet.size:
        cac_bytes = await cachet.read()
        cac_key = f"{org_id}/tools/signing/{job_id}/cac{_ext(cachet.filename)}"
        mc.upload_bytes(cac_key, cac_bytes, cachet.content_type or "image/png")

    # Si pas d'image uploadee, charger depuis le profil company
    if not sig_key or not cac_key:
        profile_sig, profile_cac = await _profile_keys(org_id)
        if not sig_key and profile_sig:
            sig_key = profile_sig
        if not cac_key and profile_cac:
            cac_key = profile_cac

    # Plus de tampon générique côté service : sans image, le document
    # reviendrait inchangé. On le dit tout de suite plutôt qu'après le job.
    if paraphe_mode and not sig_key:
        raise HTTPException(
            status_code=400,
            detail="Aucune image de paraphe : ajoutez-en une, ou une signature dans le profil entreprise.",
        )
    if not paraphe_mode and not sig_key and not cac_key:
        raise HTTPException(
            status_code=400,
            detail="Aucune signature ni cachet : ajoutez-les ici, ou dans le profil entreprise.",
        )

    # Enregistrer l'etat initial
    set_job(job_id, {"status": "pending", "type": "sign", "org_id": org_id})

    # Dispatcher la tache Celery
    task_sign_pdf.delay(
        job_id=job_id,
        org_id=org_id,
        pdf_key=pdf_key,
        sig_key=sig_key,
        cac_key=cac_key,
        sig_w=sig_w, sig_h=sig_h, sig_mx=sig_mx, sig_my=sig_my,
        cac_w=cac_w, cac_h=cac_h, cac_mx=cac_mx, cac_my=cac_my,
        fait_a_lieu=fait_a_lieu,
        fait_a_date=fait_a_date,
        original_filename=pdf.filename or "document.pdf",
        paraphe=paraphe_mode,
    )

    return {"job_id": job_id, "status": "pending"}


@router.get("/status/{job_id}")
async def sign_status(
    job_id: str,
    current_user: UserPublic = Depends(get_current_user),
) -> dict:
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job introuvable ou expiré.")

    org_id = current_user.org_id or current_user.id
    if job.get("org_id") != org_id:
        raise HTTPException(status_code=403, detail="Accès refusé.")

    response = {"job_id": job_id, "status": job["status"]}

    if job["status"] == "done":
        try:
            response["download_url"] = mc.presigned_get(job["result_key"])
            response["filename"] = job.get("filename", "document_signe.pdf")
        except Exception:
            response["status"] = "failed"
            response["error"] = "Fichier résultat introuvable."

    if job["status"] == "failed":
        response["error"] = job.get("error", "Erreur inconnue.")

    return response


@router.delete("/cancel/{job_id}")
async def sign_cancel(
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


def _ext(filename: str | None) -> str:
    from pathlib import Path
    return Path(filename or "file.png").suffix or ".png"
