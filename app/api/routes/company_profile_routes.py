import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select

from app.api.dependencies import get_current_user
from app.db.base import AsyncSessionLocal
from app.db.models import CompanyProfile
from app.models.company_profile import (
    CompanyProfileResponse,
    CompanyProfileUpsert,
    ProfileCompletenessCheck,
)
from app.models.user import UserPublic

router = APIRouter(prefix="/company-profile", tags=["Profil entreprise"])
logger = logging.getLogger(__name__)

_IMG_MAX_MB = 5

# Champs requis pour le pipeline AO
_PIPELINE_REQUIRED = ["nom_entreprise", "ice", "gerant_nom", "gerant_prenom", "adresse"]
# Champs requis pour le RAG / génération texte
_RAG_REQUIRED = ["nom_entreprise", "secteur"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_complet(profile: CompanyProfile) -> bool:
    return all(getattr(profile, f, "") for f in _PIPELINE_REQUIRED)


def _presigned(key: str | None) -> str | None:
    if not key:
        return None
    try:
        from app.storage import minio_client as mc
        return mc.presigned_get(key)
    except Exception:
        return None


def _to_response(p: CompanyProfile) -> CompanyProfileResponse:
    return CompanyProfileResponse(
        id=p.id,
        org_id=p.org_id,
        created_at=p.created_at,
        updated_at=p.updated_at,
        nom_entreprise=p.nom_entreprise,
        ice=p.ice,
        rc=p.rc,
        if_fiscal=p.if_fiscal,
        cnss=p.cnss,
        adresse=p.adresse,
        ville=p.ville,
        telephone=p.telephone,
        email=p.email,
        gerant_nom=p.gerant_nom,
        gerant_prenom=p.gerant_prenom,
        gerant_cin=p.gerant_cin,
        secteur=p.secteur,
        extra=p.extra,
        complet=_is_complet(p),
        signature_minio_key=p.signature_minio_key,
        cachet_minio_key=p.cachet_minio_key,
        signature_url=_presigned(p.signature_minio_key),
        cachet_url=_presigned(p.cachet_minio_key),
    )


@router.get("", response_model=CompanyProfileResponse | None)
async def get_profile(
    current_user: UserPublic = Depends(get_current_user),
) -> CompanyProfileResponse | None:
    org_id = current_user.org_id or current_user.id
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(CompanyProfile).where(CompanyProfile.org_id == org_id)
        )
        profile = result.scalar_one_or_none()
    return _to_response(profile) if profile else None


@router.post("", response_model=CompanyProfileResponse)
async def upsert_profile(
    body: CompanyProfileUpsert,
    current_user: UserPublic = Depends(get_current_user),
) -> CompanyProfileResponse:
    """Crée ou met à jour le profil entreprise (upsert par org_id)."""
    org_id = current_user.org_id or current_user.id
    now    = _now_iso()

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(CompanyProfile).where(CompanyProfile.org_id == org_id)
        )
        profile = result.scalar_one_or_none()

        if profile:
            for field, val in body.model_dump().items():
                setattr(profile, field, val)
            profile.updated_at = now
        else:
            profile = CompanyProfile(
                id=str(uuid.uuid4()),
                org_id=org_id,
                created_at=now,
                updated_at=now,
                **body.model_dump(),
            )
            session.add(profile)

        await session.commit()
        await session.refresh(profile)

    logger.info("Profil entreprise mis à jour: org=%s complet=%s", org_id, _is_complet(profile))
    return _to_response(profile)


@router.post("/signature", response_model=CompanyProfileResponse)
async def upload_signature(
    file: UploadFile = File(...),
    current_user: UserPublic = Depends(get_current_user),
) -> CompanyProfileResponse:
    """Upload l'image de signature du gérant (PNG/JPG)."""
    return await _upload_image_asset(file, "signature", current_user)


@router.post("/cachet", response_model=CompanyProfileResponse)
async def upload_cachet(
    file: UploadFile = File(...),
    current_user: UserPublic = Depends(get_current_user),
) -> CompanyProfileResponse:
    """Upload l'image du cachet de l'entreprise (PNG/JPG)."""
    return await _upload_image_asset(file, "cachet", current_user)


async def _upload_image_asset(
    file: UploadFile,
    asset: str,
    current_user: UserPublic,
) -> CompanyProfileResponse:
    org_id = current_user.org_id or current_user.id

    allowed = ("image/png", "image/jpeg", "image/jpg")
    if file.content_type not in allowed:
        raise HTTPException(400, "Format non supporté. PNG ou JPEG requis.")

    data = await file.read()
    if len(data) > _IMG_MAX_MB * 1024 * 1024:
        raise HTTPException(400, f"Image trop volumineuse (max {_IMG_MAX_MB} Mo).")

    ext = "png" if file.content_type == "image/png" else "jpg"
    key = f"{org_id}/profile/{asset}.{ext}"

    from app.storage import minio_client as mc
    mc.upload_bytes(key, data, file.content_type or "image/png")

    now = _now_iso()
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(CompanyProfile).where(CompanyProfile.org_id == org_id)
        )
        profile = result.scalar_one_or_none()
        if not profile:
            profile = CompanyProfile(
                id=str(uuid.uuid4()),
                org_id=org_id,
                created_at=now,
                updated_at=now,
            )
            session.add(profile)

        if asset == "signature":
            profile.signature_minio_key = key
        else:
            profile.cachet_minio_key = key
        profile.updated_at = now
        await session.commit()
        await session.refresh(profile)

    logger.info("[company_profile] %s uploadé org=%s key=%s", asset, org_id, key)
    return _to_response(profile)


@router.get("/check", response_model=ProfileCompletenessCheck)
async def check_profile(
    current_user: UserPublic = Depends(get_current_user),
) -> ProfileCompletenessCheck:
    """Vérifie si le profil est suffisamment complet pour lancer le pipeline."""
    org_id = current_user.org_id or current_user.id
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(CompanyProfile).where(CompanyProfile.org_id == org_id)
        )
        profile = result.scalar_one_or_none()

    if not profile:
        return ProfileCompletenessCheck(
            complet=False,
            champs_manquants=_PIPELINE_REQUIRED,
            message="Profil entreprise non configuré. Renseignez votre profil avant de lancer le pipeline.",
        )

    manquants = [f for f in _PIPELINE_REQUIRED if not getattr(profile, f, "")]
    complet   = len(manquants) == 0

    return ProfileCompletenessCheck(
        complet=complet,
        champs_manquants=manquants,
        message=None if complet else f"Champs requis manquants : {', '.join(manquants)}.",
    )
