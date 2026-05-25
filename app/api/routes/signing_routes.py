import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from app.api.dependencies import get_current_user
from app.models.user import UserPublic
from app.services.signing_service import sign_pdf
from app.storage import minio_client as mc

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/sign", tags=["Signature"])


@router.post("/pdf")
async def sign_pdf_endpoint(
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
    marche_id: Optional[str] = Form(default=None),
    current_user: UserPublic = Depends(get_current_user),
) -> Response:
    """
    Signe un PDF :
    - signature en bas à droite sur toutes les pages
    - cachet en bas à gauche sur la dernière page (optionnel)
    Retourne le PDF signé (et l'enregistre dans MinIO si marche_id fourni).
    """
    pdf_bytes = await pdf.read()
    sig_bytes = await signature.read() if signature else None
    cac_bytes = await cachet.read() if cachet else None

    signed_bytes = sign_pdf(
        pdf_bytes, sig_bytes, cac_bytes,
        sig_w, sig_h, sig_mx, sig_my,
        cac_w, cac_h, cac_mx, cac_my,
        fait_a_lieu, fait_a_date,
    )

    org_id = current_user.org_id or current_user.id

    if marche_id:
        job_id = uuid.uuid4().hex
        original_name = (pdf.filename or "document").replace(".pdf", "")
        minio_key = f"{org_id}/marches/{marche_id}/signing/{job_id}/{original_name}_signe.pdf"
        try:
            mc.upload_bytes(minio_key, signed_bytes, "application/pdf")
            logger.info("Signing uploadé: %s", minio_key)
        except Exception as exc:
            logger.warning("MinIO upload signing échoué: %s", exc)

        await _save_signing_job(marche_id, org_id, job_id)

    filename = (pdf.filename or "document").replace(".pdf", "_signe.pdf")
    return Response(
        content=signed_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def _save_signing_job(marche_id: str, org_id: str, job_id: str) -> None:
    from app.db.base import AsyncSessionLocal
    from app.db.models import SigningJob

    try:
        async with AsyncSessionLocal() as session:
            job = SigningJob(
                id=uuid.uuid4().hex,
                marche_id=marche_id,
                org_id=org_id,
                created_at=datetime.now(timezone.utc).isoformat(),
                job_id=job_id,
                statut="termine",
            )
            session.add(job)
            await session.commit()
    except Exception as exc:
        logger.warning("Impossible de sauvegarder SigningJob: %s", exc)
