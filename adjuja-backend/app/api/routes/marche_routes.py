import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.dependencies import get_current_user
from app.db.base import AsyncSessionLocal
from app.db.models import FillerJob, Marche, OffreTechniqueJob, SigningJob
from app.models.marche import JobSummary, MarcheCreate, MarcheResponse, MarcheSummary
from app.models.user import UserPublic
from app.services.security.input_sanitizer import validate_upload_size

router = APIRouter(prefix="/marches", tags=["Marchés"])
logger = logging.getLogger(__name__)

_ALLOWED_PDF_MIME = {"application/pdf", "application/octet-stream"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _marche_to_response(m: Marche) -> MarcheResponse:
    def _jobs(jobs) -> list[JobSummary]:
        return [JobSummary(id=j.id, job_id=j.job_id, created_at=j.created_at, statut=j.statut) for j in jobs]

    return MarcheResponse(
        id=m.id,
        reference=m.reference,
        acheteur=m.acheteur,
        objet=m.objet,
        statut=m.statut,
        created_at=m.created_at,
        cps_uploaded=bool(m.cps_key),
        rc_uploaded=bool(m.rc_key),
        offre_technique_jobs=_jobs(m.offre_technique_jobs),
        filler_jobs=_jobs(m.filler_jobs),
        signing_jobs=_jobs(m.signing_jobs),
    )


@router.post("", response_model=MarcheSummary, status_code=status.HTTP_201_CREATED)
async def create_marche(
    body: MarcheCreate,
    current_user: UserPublic = Depends(get_current_user),
) -> MarcheSummary:
    org_id = current_user.org_id or current_user.id
    marche_id = str(uuid.uuid4())

    async with AsyncSessionLocal() as session:
        m = Marche(
            id=marche_id,
            org_id=org_id,
            user_id=current_user.id,
            created_at=_now_iso(),
            reference=body.reference,
            acheteur=body.acheteur,
            objet=body.objet,
            statut="en_cours",
        )
        session.add(m)
        await session.commit()

    logger.info("Marché créé: %s org=%s ref=%s", marche_id, org_id, body.reference)
    return MarcheSummary(
        id=marche_id,
        reference=body.reference,
        acheteur=body.acheteur,
        objet=body.objet,
        statut="en_cours",
        created_at=m.created_at,
        cps_uploaded=False,
        rc_uploaded=False,
    )


@router.get("", response_model=list[MarcheSummary])
async def list_marches(
    current_user: UserPublic = Depends(get_current_user),
) -> list[MarcheSummary]:
    org_id = current_user.org_id or current_user.id
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Marche)
            .where(Marche.org_id == org_id)
            .order_by(Marche.created_at.desc())
        )
        marches = result.scalars().all()

    return [
        MarcheSummary(
            id=m.id,
            reference=m.reference,
            acheteur=m.acheteur,
            objet=m.objet,
            statut=m.statut,
            created_at=m.created_at,
            cps_uploaded=bool(m.cps_key),
            rc_uploaded=bool(m.rc_key),
        )
        for m in marches
    ]


@router.get("/{marche_id}", response_model=MarcheResponse)
async def get_marche(
    marche_id: str,
    current_user: UserPublic = Depends(get_current_user),
) -> MarcheResponse:
    org_id = current_user.org_id or current_user.id
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Marche)
            .where(Marche.id == marche_id, Marche.org_id == org_id)
            .options(
                selectinload(Marche.offre_technique_jobs),
                selectinload(Marche.filler_jobs),
                selectinload(Marche.signing_jobs),
            )
        )
        m = result.scalar_one_or_none()

    if not m:
        raise HTTPException(status_code=404, detail="Marché introuvable.")

    return _marche_to_response(m)


@router.post("/{marche_id}/upload-cps", response_model=MarcheSummary)
async def upload_cps(
    marche_id: str,
    file: UploadFile,
    current_user: UserPublic = Depends(get_current_user),
) -> MarcheSummary:
    org_id = current_user.org_id or current_user.id

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Seuls les fichiers PDF sont acceptés.")

    pdf_bytes = await file.read()
    validate_upload_size(pdf_bytes, "CPS")

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Marche).where(Marche.id == marche_id, Marche.org_id == org_id)
        )
        m = result.scalar_one_or_none()
        if not m:
            raise HTTPException(status_code=404, detail="Marché introuvable.")

        from app.storage import minio_client as mc
        cps_key = mc.upload_dedup(
            pdf_bytes,
            prefix=f"{org_id}/marches/{marche_id}/cps",
            content_type="application/pdf",
        )
        m.cps_key = cps_key
        await session.commit()

        logger.info("CPS uploadé pour marché %s: %s", marche_id, cps_key)
        return MarcheSummary(
            id=m.id,
            reference=m.reference,
            acheteur=m.acheteur,
            objet=m.objet,
            statut=m.statut,
            created_at=m.created_at,
            cps_uploaded=True,
            rc_uploaded=bool(m.rc_key),
        )


@router.post("/{marche_id}/upload-rc", response_model=MarcheSummary)
async def upload_rc(
    marche_id: str,
    file: UploadFile,
    current_user: UserPublic = Depends(get_current_user),
) -> MarcheSummary:
    org_id = current_user.org_id or current_user.id

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Seuls les fichiers PDF sont acceptés.")

    pdf_bytes = await file.read()
    validate_upload_size(pdf_bytes, "RC")

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Marche).where(Marche.id == marche_id, Marche.org_id == org_id)
        )
        m = result.scalar_one_or_none()
        if not m:
            raise HTTPException(status_code=404, detail="Marché introuvable.")

        from app.storage import minio_client as mc
        rc_key = mc.upload_dedup(
            pdf_bytes,
            prefix=f"{org_id}/marches/{marche_id}/rc",
            content_type="application/pdf",
        )
        m.rc_key = rc_key
        await session.commit()

        logger.info("RC uploadé pour marché %s: %s", marche_id, rc_key)
        return MarcheSummary(
            id=m.id,
            reference=m.reference,
            acheteur=m.acheteur,
            objet=m.objet,
            statut=m.statut,
            created_at=m.created_at,
            cps_uploaded=bool(m.cps_key),
            rc_uploaded=True,
        )
