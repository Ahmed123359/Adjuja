"""Routes CRUD pour les documents permanents de l'entreprise + upload PDF."""
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy import select

from app.api.dependencies import get_current_user
from app.db.base import AsyncSessionLocal
from app.db.models import CompanyDocument
from app.models.company_document import (
    CompanyDocumentCreate,
    CompanyDocumentResponse,
    COMPANY_DOC_TYPES,
)
from app.models.user import UserPublic

router = APIRouter(prefix="/company-documents", tags=["Documents entreprise"])
logger = logging.getLogger(__name__)

_DOC_MAX_MB = 20


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _presigned(key: str | None) -> str | None:
    if not key:
        return None
    try:
        from app.storage import minio_client as mc
        return mc.presigned_get(key)
    except Exception:
        return None


def _to_response(doc: CompanyDocument) -> CompanyDocumentResponse:
    return CompanyDocumentResponse(
        id=doc.id,
        org_id=doc.org_id,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        doc_type=doc.doc_type,
        nom_fichier=doc.nom_fichier,
        minio_key=doc.minio_key,
        file_url=_presigned(doc.minio_key),
        description=doc.description,
        date_validite=doc.date_validite,
    )


# ── Liste ──────────────────────────────────────────────────────────────────

@router.get("", response_model=list[CompanyDocumentResponse])
async def list_documents(
    current_user: UserPublic = Depends(get_current_user),
) -> list[CompanyDocumentResponse]:
    org_id = current_user.org_id or current_user.id
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(CompanyDocument)
            .where(CompanyDocument.org_id == org_id)
            .order_by(CompanyDocument.doc_type, CompanyDocument.created_at)
        )
        docs = result.scalars().all()
    return [_to_response(d) for d in docs]


# ── Upload (crée ou remplace) ──────────────────────────────────────────────

@router.post("", response_model=CompanyDocumentResponse, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    description: str | None = Form(None),
    date_validite: str | None = Form(None),
    current_user: UserPublic = Depends(get_current_user),
) -> CompanyDocumentResponse:
    """Upload un document permanent. Si un doc du même type existe, il est remplacé."""
    org_id = current_user.org_id or current_user.id

    if doc_type not in COMPANY_DOC_TYPES:
        raise HTTPException(400, f"doc_type invalide. Valeurs: {COMPANY_DOC_TYPES}")

    allowed_types = (
        "application/pdf",
        "image/png",
        "image/jpeg",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    if file.content_type not in allowed_types:
        raise HTTPException(400, "Format non supporté (PDF, DOCX, PNG, JPEG acceptés).")

    data = await file.read()
    if len(data) > _DOC_MAX_MB * 1024 * 1024:
        raise HTTPException(400, f"Fichier trop volumineux (max {_DOC_MAX_MB} Mo).")

    nom_fichier = file.filename or f"{doc_type}.pdf"
    ext = nom_fichier.rsplit(".", 1)[-1].lower() if "." in nom_fichier else "pdf"
    now = _now_iso()

    async with AsyncSessionLocal() as session:
        from app.storage import minio_client as mc

        # Chercher si un doc du même type existe déjà pour cette org
        result = await session.execute(
            select(CompanyDocument).where(
                CompanyDocument.org_id == org_id,
                CompanyDocument.doc_type == doc_type,
            )
        )
        existing = result.scalar_one_or_none()

        doc_id = existing.id if existing else str(uuid.uuid4())
        key = f"{org_id}/profile/documents/{doc_type}/{doc_id}.{ext}"

        # Supprimer l'ancienne version si elle existe
        if existing and existing.minio_key:
            try:
                mc.delete(existing.minio_key)
            except Exception:
                pass

        mc.upload_bytes(key, data, file.content_type or "application/octet-stream")

        if existing:
            existing.updated_at    = now
            existing.minio_key     = key
            existing.nom_fichier   = nom_fichier
            existing.description   = description
            existing.date_validite = date_validite
            doc = existing
        else:
            doc = CompanyDocument(
                id=doc_id,
                org_id=org_id,
                created_at=now,
                updated_at=now,
                doc_type=doc_type,
                nom_fichier=nom_fichier,
                minio_key=key,
                description=description,
                date_validite=date_validite,
            )
            session.add(doc)

        await session.commit()
        await session.refresh(doc)

    # Indexer dans le RAG si c'est un PDF (non bloquant)
    if ext == "pdf":
        try:
            import fitz
            from app.services.rag_service import get_rag_service

            with fitz.open(stream=data, filetype="pdf") as pdf:
                text = "".join(page.get_text() for page in pdf)[:10000]

            if text.strip():
                rag = get_rag_service()
                await rag.index_document(
                    org_id=org_id,
                    text=text,
                    metadata={
                        "type": "company_document",
                        "doc_type": doc_type,
                        "nom_fichier": nom_fichier,
                        "company_doc_id": doc.id,
                    },
                    doc_id=f"cdoc_{doc.id}",
                )
        except Exception as exc:
            logger.warning("[company_doc] indexation RAG échouée doc_id=%s: %s", doc.id, exc)

    return _to_response(doc)


# ── Suppression ────────────────────────────────────────────────────────────

@router.delete("/{doc_id}", status_code=204)
async def delete_document(
    doc_id: str,
    current_user: UserPublic = Depends(get_current_user),
) -> None:
    org_id = current_user.org_id or current_user.id
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(CompanyDocument).where(
                CompanyDocument.id == doc_id,
                CompanyDocument.org_id == org_id,
            )
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(404, "Document introuvable")
        if doc.minio_key:
            try:
                from app.storage import minio_client as mc
                mc.delete(doc.minio_key)
            except Exception:
                pass
        await session.delete(doc)
        await session.commit()
