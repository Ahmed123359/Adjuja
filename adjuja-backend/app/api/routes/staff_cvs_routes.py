"""Routes CRUD pour le pool de CVs de l'entreprise + upload PDF CV + extraction IA."""
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy import select, delete as sa_delete

from app.api.dependencies import get_current_user
from app.db.base import AsyncSessionLocal
from app.db.models import StaffCv, AoTeamMember
from app.models.staff_cv import StaffCvCreate, StaffCvUpdate, StaffCvResponse, AoTeamMemberResponse
from app.models.user import UserPublic

router = APIRouter(prefix="/staff-cvs", tags=["Equipe / CVs"])
logger = logging.getLogger(__name__)

_CV_MAX_MB = 10


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_response(cv: StaffCv, cv_url: str | None = None) -> StaffCvResponse:
    return StaffCvResponse(
        id=cv.id,
        org_id=cv.org_id,
        created_at=cv.created_at,
        updated_at=cv.updated_at,
        nom=cv.nom,
        prenom=cv.prenom,
        poste=cv.poste,
        specialite=cv.specialite,
        diplome=cv.diplome,
        annees_experience=cv.annees_experience,
        actif=cv.actif,
        details=cv.details,
        cv_minio_key=cv.cv_minio_key,
        cv_url=cv_url,
    )


def _presigned(key: str | None) -> str | None:
    if not key:
        return None
    try:
        from app.storage import minio_client as mc
        return mc.presigned_get(key)
    except Exception:
        return None


# ── Liste ──────────────────────────────────────────────────────────────────

@router.get("", response_model=list[StaffCvResponse])
async def list_cvs(
    current_user: UserPublic = Depends(get_current_user),
) -> list[StaffCvResponse]:
    org_id = current_user.org_id or current_user.id
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(StaffCv).where(StaffCv.org_id == org_id).order_by(StaffCv.nom)
        )
        cvs = result.scalars().all()
    return [_to_response(cv, _presigned(cv.cv_minio_key)) for cv in cvs]


# ── Création ───────────────────────────────────────────────────────────────

@router.post("", response_model=StaffCvResponse, status_code=201)
async def create_cv(
    body: StaffCvCreate,
    current_user: UserPublic = Depends(get_current_user),
) -> StaffCvResponse:
    org_id = current_user.org_id or current_user.id
    now = _now_iso()
    cv = StaffCv(
        id=str(uuid.uuid4()),
        org_id=org_id,
        created_at=now,
        updated_at=now,
        **body.model_dump(),
    )
    async with AsyncSessionLocal() as session:
        session.add(cv)
        await session.commit()
        await session.refresh(cv)
    return _to_response(cv)


# ── Lecture ────────────────────────────────────────────────────────────────

@router.get("/{cv_id}", response_model=StaffCvResponse)
async def get_cv(
    cv_id: str,
    current_user: UserPublic = Depends(get_current_user),
) -> StaffCvResponse:
    org_id = current_user.org_id or current_user.id
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(StaffCv).where(StaffCv.id == cv_id, StaffCv.org_id == org_id)
        )
        cv = result.scalar_one_or_none()
    if not cv:
        raise HTTPException(404, "CV introuvable")
    return _to_response(cv, _presigned(cv.cv_minio_key))


# ── Mise à jour ────────────────────────────────────────────────────────────

@router.put("/{cv_id}", response_model=StaffCvResponse)
async def update_cv(
    cv_id: str,
    body: StaffCvUpdate,
    current_user: UserPublic = Depends(get_current_user),
) -> StaffCvResponse:
    org_id = current_user.org_id or current_user.id
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(StaffCv).where(StaffCv.id == cv_id, StaffCv.org_id == org_id)
        )
        cv = result.scalar_one_or_none()
        if not cv:
            raise HTTPException(404, "CV introuvable")
        for field, val in body.model_dump().items():
            setattr(cv, field, val)
        cv.updated_at = _now_iso()
        await session.commit()
        await session.refresh(cv)
    return _to_response(cv, _presigned(cv.cv_minio_key))


# ── Extraction IA depuis PDF ───────────────────────────────────────────────

class CvExtractResponse(BaseModel):
    nom:               str
    prenom:            str
    poste:             str
    specialite:        str
    diplome:           str
    annees_experience: int
    tmp_pdf_bytes_b64: str   # PDF encodé en base64 pour re-upload côté client


@router.post("/extract", response_model=CvExtractResponse)
async def extract_cv_from_pdf(
    file: UploadFile = File(...),
    current_user: UserPublic = Depends(get_current_user),
) -> CvExtractResponse:
    """
    Reçoit un PDF de CV, extrait le texte, demande au modele du role « fast » d'en extraire les
    métadonnées structurées (nom, poste, expérience...). Retourne les champs
    pré-remplis + le PDF encodé pour le re-upload après validation.
    """
    if file.content_type not in ("application/pdf",):
        raise HTTPException(400, "Seuls les fichiers PDF sont acceptés.")

    data = await file.read()
    if len(data) > _CV_MAX_MB * 1024 * 1024:
        raise HTTPException(400, f"Fichier trop volumineux (max {_CV_MAX_MB} Mo).")

    # Extraction texte
    try:
        import fitz
        with fitz.open(stream=data, filetype="pdf") as pdf:
            text = "".join(page.get_text() for page in pdf)[:8000]
    except Exception as exc:
        raise HTTPException(422, f"Impossible de lire le PDF : {exc}")

    if not text.strip():
        raise HTTPException(422, "PDF sans texte extractible (probablement scanné).")

    # Extraction IA
    import json, re
    from app.providers.router import get_chat

    prompt = f"""Extrait les informations professionnelles de ce CV et retourne UNIQUEMENT un JSON valide (sans markdown) :

{{
  "nom": "...",
  "prenom": "...",
  "poste": "poste actuel ou titre professionnel",
  "specialite": "domaine technique principal (ex: Génie civil, Informatique, BTP...)",
  "diplome": "diplôme le plus élevé (ex: Ingénieur d'état en génie civil)",
  "annees_experience": 0
}}

RÈGLES :
- annees_experience : nombre entier d'années d'expérience professionnelle totale
- Si une information est absente, mettre une chaîne vide "" (sauf annees_experience : 0)
- Ne jamais inventer des informations non présentes dans le CV

CV :
{text}"""

    # Role « fast » (spec fournisseurs-ia) : fournisseur choisi dans .env (LLM_FAST).
    try:
        raw, _tokens = await get_chat("fast").generate_text(
            "Tu extrais les informations d'un CV. Tu reponds en JSON.",
            prompt,
            max_tokens=1500, temperature=0, json_mode=True,
        )
    except Exception as e:
        logger.error("Extraction CV : appel du modele echoue : %s", e)
        raise HTTPException(status_code=502, detail="Service d'extraction IA indisponible. Réessayez dans un instant.")
    raw = raw or "{}"
    try:
        extracted = json.loads(raw)
    except Exception:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        extracted = json.loads(m.group()) if m else {}

    import base64
    return CvExtractResponse(
        nom=extracted.get("nom", ""),
        prenom=extracted.get("prenom", ""),
        poste=extracted.get("poste", ""),
        specialite=extracted.get("specialite", ""),
        diplome=extracted.get("diplome", ""),
        annees_experience=int(extracted.get("annees_experience", 0)),
        tmp_pdf_bytes_b64=base64.b64encode(data).decode(),
    )


# ── Suppression ────────────────────────────────────────────────────────────

@router.delete("/{cv_id}", status_code=204)
async def delete_cv(
    cv_id: str,
    current_user: UserPublic = Depends(get_current_user),
) -> None:
    org_id = current_user.org_id or current_user.id
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(StaffCv).where(StaffCv.id == cv_id, StaffCv.org_id == org_id)
        )
        cv = result.scalar_one_or_none()
        if not cv:
            raise HTTPException(404, "CV introuvable")
        # Supprimer le fichier MinIO si présent
        if cv.cv_minio_key:
            try:
                from app.storage import minio_client as mc
                mc.delete(cv.cv_minio_key)
            except Exception:
                pass
        await session.delete(cv)
        await session.commit()


# ── Upload PDF du CV ───────────────────────────────────────────────────────

@router.post("/{cv_id}/upload", response_model=StaffCvResponse)
async def upload_cv_pdf(
    cv_id: str,
    file: UploadFile = File(...),
    current_user: UserPublic = Depends(get_current_user),
) -> StaffCvResponse:
    org_id = current_user.org_id or current_user.id

    if file.content_type not in ("application/pdf",):
        raise HTTPException(400, "Seuls les fichiers PDF sont acceptés pour le CV.")

    data = await file.read()
    if len(data) > _CV_MAX_MB * 1024 * 1024:
        raise HTTPException(400, f"Fichier trop volumineux (max {_CV_MAX_MB} Mo).")

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(StaffCv).where(StaffCv.id == cv_id, StaffCv.org_id == org_id)
        )
        cv = result.scalar_one_or_none()
        if not cv:
            raise HTTPException(404, "CV introuvable")

        from app.storage import minio_client as mc

        # Supprimer l'ancien fichier si existant
        if cv.cv_minio_key:
            try:
                mc.delete(cv.cv_minio_key)
            except Exception:
                pass

        key = f"{org_id}/staff/{cv_id}/cv.pdf"
        mc.upload_bytes(key, data, "application/pdf")

        cv.cv_minio_key = key
        cv.updated_at   = _now_iso()
        await session.commit()
        await session.refresh(cv)

    # Indexer dans le RAG de l'org (non bloquant)
    try:
        import fitz
        import asyncio
        from app.services.rag_service import get_rag_service

        with fitz.open(stream=data, filetype="pdf") as pdf:
            text = "".join(page.get_text() for page in pdf)[:8000]

        if text.strip():
            rag = get_rag_service()
            await rag.index_document(
                org_id=org_id,
                text=text,
                metadata={
                    "type": "cv",
                    "staff_cv_id": cv_id,
                    "nom": cv.nom,
                    "prenom": cv.prenom,
                    "poste": cv.poste,
                    "specialite": cv.specialite,
                    "annees_experience": cv.annees_experience,
                },
                doc_id=f"cv_{cv_id}",
            )
    except Exception as exc:
        logger.warning("[staff_cv] indexation RAG échouée cv_id=%s: %s", cv_id, exc)

    return _to_response(cv, _presigned(cv.cv_minio_key))


# ── Equipe d'un AO ─────────────────────────────────────────────────────────

@router.get("/ao/{ao_id}/team", response_model=list[AoTeamMemberResponse])
async def get_ao_team(
    ao_id: str,
    current_user: UserPublic = Depends(get_current_user),
) -> list[AoTeamMemberResponse]:
    """Retourne les membres de l'équipe affectés à un AO."""
    org_id = current_user.org_id or current_user.id
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AoTeamMember).where(AoTeamMember.ao_id == ao_id)
        )
        members = result.scalars().all()

        out = []
        for m in members:
            cv_resp = None
            if m.staff_cv_id:
                cv_res = await session.execute(
                    select(StaffCv).where(
                        StaffCv.id == m.staff_cv_id,
                        StaffCv.org_id == org_id,
                    )
                )
                cv = cv_res.scalar_one_or_none()
                if cv:
                    cv_resp = _to_response(cv, _presigned(cv.cv_minio_key))
            out.append(AoTeamMemberResponse(
                id=m.id,
                ao_id=m.ao_id,
                staff_cv_id=m.staff_cv_id,
                created_at=m.created_at,
                role_dans_offre=m.role_dans_offre,
                profil_requis_ref=m.profil_requis_ref,
                warning=m.warning,
                cv=cv_resp,
            ))
    return out
