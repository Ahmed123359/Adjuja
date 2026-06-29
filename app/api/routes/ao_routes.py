import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from pydantic import BaseModel
from typing import Annotated
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.dependencies import get_current_user
from app.db.base import AsyncSessionLocal
from app.db.models import AoDocument, AppelOffre, CompanyProfile
from app.models.ao_pipeline import AoCreate, AoDocumentOut, AoResponse, AoStatus, AoSummary
from app.models.user import UserPublic
from app.services.eligibility_service import compute_verdict
from app.services.security.input_sanitizer import validate_upload_size

router = APIRouter(prefix="/ao", tags=["Appels d'offres"])
logger = logging.getLogger(__name__)

_ALLOWED_PDF_MIME = {"application/pdf", "application/octet-stream"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _doc_to_out(d: AoDocument) -> AoDocumentOut:
    return AoDocumentOut(
        id=d.id,
        dossier=d.dossier,
        doc_type=d.doc_type,
        origine=d.origine,
        statut=d.statut,
        nom_fichier=d.nom_fichier,
        taille_octets=d.taille_octets,
        minio_key=d.minio_key,
    )


def _ao_to_response(ao: AppelOffre) -> AoResponse:
    return AoResponse(
        id=ao.id,
        reference=ao.reference,
        acheteur=ao.acheteur,
        objet=ao.objet,
        statut=ao.statut,
        pipeline_pct=ao.pipeline_pct,
        created_at=ao.created_at,
        updated_at=ao.updated_at,
        erreur_message=ao.erreur_message,
        analyse_json=ao.analyse_json,
        custom_instructions=ao.custom_instructions,
        documents=[_doc_to_out(d) for d in ao.documents],
    )


@router.post("", response_model=AoSummary, status_code=status.HTTP_201_CREATED)
async def create_ao(
    body: AoCreate,
    current_user: UserPublic = Depends(get_current_user),
) -> AoSummary:
    org_id = current_user.org_id or current_user.id
    ao_id = str(uuid.uuid4())
    now = _now_iso()

    async with AsyncSessionLocal() as session:
        ao = AppelOffre(
            id=ao_id,
            org_id=org_id,
            user_id=current_user.id,
            created_at=now,
            updated_at=now,
            reference=body.reference,
            acheteur=body.acheteur,
            objet=body.objet,
            statut="brouillon",
            pipeline_pct=0,
            custom_instructions=body.custom_instructions,
        )
        session.add(ao)
        await session.commit()

    logger.info("AO créé: %s org=%s", ao_id, org_id)
    return AoSummary(
        id=ao_id,
        reference=body.reference,
        acheteur=body.acheteur,
        objet=body.objet,
        statut="brouillon",
        pipeline_pct=0,
        created_at=now,
        updated_at=now,
    )


class FromWatcherPayload(BaseModel):
    scraped_ao_id: int
    titre: str
    acheteur: str | None = None
    date_limite: str | None = None
    categorie: str | None = None
    region: str | None = None
    classified_docs: dict[str, str] = {}
    analyse_json: dict | None = None


class EligibilityCheckPayload(BaseModel):
    analyse_json: dict
    date_limite: str | None = None


@router.post("/from-watcher", response_model=AoSummary, status_code=status.HTTP_201_CREATED)
async def import_from_watcher(
    body: FromWatcherPayload,
    current_user: UserPublic = Depends(get_current_user),
) -> AoSummary:
    """Crée un AO à partir d'un appel d'offres favorisé dans la veille (ao-watcher).
    Les documents (classified_docs) sont déjà sur MinIO (bucket partagé) : on les référence
    directement sans les re-télécharger.
    """
    org_id = current_user.org_id or current_user.id
    ao_id = str(uuid.uuid4())
    now = _now_iso()

    from app.storage import minio_client as mc

    async with AsyncSessionLocal() as session:
        ao = AppelOffre(
            id=ao_id,
            org_id=org_id,
            user_id=current_user.id,
            created_at=now,
            updated_at=now,
            reference=f"watcher-{body.scraped_ao_id}",
            acheteur=body.acheteur or "",
            objet=body.titre,
            statut="brouillon",
            pipeline_pct=0,
            analyse_json=body.analyse_json,
        )
        session.add(ao)

        for label, minio_key in body.classified_docs.items():
            session.add(AoDocument(
                id=str(uuid.uuid4()),
                ao_id=ao_id,
                created_at=now,
                dossier="source",
                doc_type=label,
                origine="upload",
                statut="en_attente",
                minio_key=minio_key,
                nom_fichier=f"{label}.pdf",
                taille_octets=mc.stat_size(minio_key),
            ))

        await session.commit()

    logger.info("AO importé depuis ao-watcher: %s org=%s scraped_ao=%s", ao_id, org_id, body.scraped_ao_id)
    return AoSummary(
        id=ao_id,
        reference=ao.reference,
        acheteur=ao.acheteur,
        objet=ao.objet,
        statut="brouillon",
        pipeline_pct=0,
        created_at=now,
        updated_at=now,
    )


@router.post("/eligibility-check")
async def eligibility_check(
    body: EligibilityCheckPayload,
    current_user: UserPublic = Depends(get_current_user),
) -> dict:
    """
    Calcule le verdict Go/No-Go pour l'org de l'appelant en comparant
    analyse_json (deja calcule cote ao-watcher, un seul appel Mistral par AO)
    aux donnees d'eligibilite du profil entreprise. Aucun appel IA ici :
    comparaison Python deterministe (app/services/eligibility_service.py).
    """
    org_id = current_user.org_id or current_user.id
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(CompanyProfile).where(CompanyProfile.org_id == org_id)
        )
        profile = result.scalar_one_or_none()

    extra = profile.extra if profile and profile.extra else {}
    return compute_verdict(body.analyse_json, body.date_limite, extra)


@router.get("", response_model=list[AoSummary])
async def list_ao(
    current_user: UserPublic = Depends(get_current_user),
) -> list[AoSummary]:
    org_id = current_user.org_id or current_user.id
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AppelOffre)
            .where(AppelOffre.org_id == org_id)
            .order_by(AppelOffre.created_at.desc())
        )
        aos = result.scalars().all()

    return [
        AoSummary(
            id=ao.id,
            reference=ao.reference,
            acheteur=ao.acheteur,
            objet=ao.objet,
            statut=ao.statut,
            pipeline_pct=ao.pipeline_pct,
            created_at=ao.created_at,
            updated_at=ao.updated_at,
        )
        for ao in aos
    ]


@router.get("/{ao_id}", response_model=AoResponse)
async def get_ao(
    ao_id: str,
    current_user: UserPublic = Depends(get_current_user),
) -> AoResponse:
    org_id = current_user.org_id or current_user.id
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AppelOffre)
            .where(AppelOffre.id == ao_id, AppelOffre.org_id == org_id)
            .options(selectinload(AppelOffre.documents))
        )
        ao = result.scalar_one_or_none()

    if not ao:
        raise HTTPException(status_code=404, detail="Appel d'offres introuvable.")

    return _ao_to_response(ao)


@router.get("/{ao_id}/status", response_model=AoStatus)
async def get_ao_status(
    ao_id: str,
    current_user: UserPublic = Depends(get_current_user),
) -> AoStatus:
    """Endpoint de polling léger pour suivre la progression du pipeline."""
    org_id = current_user.org_id or current_user.id
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AppelOffre.id, AppelOffre.statut, AppelOffre.pipeline_pct, AppelOffre.erreur_message)
            .where(AppelOffre.id == ao_id, AppelOffre.org_id == org_id)
        )
        row = result.one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="Appel d'offres introuvable.")

    return AoStatus(
        id=row.id,
        statut=row.statut,
        pipeline_pct=row.pipeline_pct,
        erreur_message=row.erreur_message,
    )


@router.post("/{ao_id}/upload", response_model=AoDocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    ao_id: str,
    file: UploadFile,
    doc_type: str = "autre",
    current_user: UserPublic = Depends(get_current_user),
) -> AoDocumentOut:
    """Upload d'un document source (CPS, RC, ou tout autre fichier PDF)."""
    org_id = current_user.org_id or current_user.id

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Seuls les fichiers PDF sont acceptés.")

    pdf_bytes = await file.read()
    validate_upload_size(pdf_bytes, file.filename)

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AppelOffre).where(AppelOffre.id == ao_id, AppelOffre.org_id == org_id)
        )
        ao = result.scalar_one_or_none()
        if not ao:
            raise HTTPException(status_code=404, detail="Appel d'offres introuvable.")

        from app.storage import minio_client as mc
        minio_key = mc.upload_dedup(
            pdf_bytes,
            prefix=f"{org_id}/ao/{ao_id}/source",
            content_type="application/pdf",
        )

        doc_id = str(uuid.uuid4())
        doc = AoDocument(
            id=doc_id,
            ao_id=ao_id,
            created_at=_now_iso(),
            dossier="source",
            doc_type=doc_type,
            origine="upload",
            statut="en_attente",
            minio_key=minio_key,
            nom_fichier=file.filename,
            taille_octets=len(pdf_bytes),
        )
        session.add(doc)
        ao.updated_at = _now_iso()
        await session.commit()

    logger.info("Document uploadé: ao=%s doc=%s type=%s", ao_id, doc_id, doc_type)
    return _doc_to_out(doc)


@router.post("/{ao_id}/upload-multiple", response_model=list[AoDocumentOut], status_code=status.HTTP_201_CREATED)
async def upload_multiple_documents(
    ao_id: str,
    files: Annotated[list[UploadFile], File(description="Fichiers PDF (CPS, RC, autres)")],
    current_user: UserPublic = Depends(get_current_user),
) -> list[AoDocumentOut]:
    """Upload de plusieurs documents en une seule requête. Le type est détecté automatiquement."""
    org_id = current_user.org_id or current_user.id

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AppelOffre).where(AppelOffre.id == ao_id, AppelOffre.org_id == org_id)
        )
        ao = result.scalar_one_or_none()
        if not ao:
            raise HTTPException(status_code=404, detail="Appel d'offres introuvable.")

        from app.storage import minio_client as mc

        created: list[AoDocumentOut] = []
        for file in files:
            if not file.filename or not file.filename.lower().endswith(".pdf"):
                raise HTTPException(status_code=400, detail=f"Fichier non-PDF refusé : {file.filename}")

            pdf_bytes = await file.read()
            validate_upload_size(pdf_bytes, file.filename)

            minio_key = mc.upload_dedup(
                pdf_bytes,
                prefix=f"{org_id}/ao/{ao_id}/source",
                content_type="application/pdf",
            )

            doc_id = str(uuid.uuid4())
            doc = AoDocument(
                id=doc_id,
                ao_id=ao_id,
                created_at=_now_iso(),
                dossier="source",
                doc_type="non_classe",
                origine="upload",
                statut="en_attente",
                minio_key=minio_key,
                nom_fichier=file.filename,
                taille_octets=len(pdf_bytes),
            )
            session.add(doc)
            created.append(_doc_to_out(doc))

        ao.updated_at = _now_iso()
        await session.commit()

    logger.info("%d document(s) uploadés: ao=%s", len(created), ao_id)
    return created


@router.get("/{ao_id}/documents/{doc_id}/download")
async def download_document(
    ao_id: str,
    doc_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    """Retourne l'URL presigned MinIO valide 15 minutes pour télécharger un document."""
    org_id = current_user.org_id or current_user.id

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AoDocument)
            .join(AppelOffre, AoDocument.ao_id == AppelOffre.id)
            .where(AoDocument.id == doc_id, AppelOffre.org_id == org_id, AoDocument.ao_id == ao_id)
        )
        doc = result.scalar_one_or_none()

    if not doc or not doc.minio_key:
        raise HTTPException(status_code=404, detail="Document introuvable.")

    key = doc.minio_key
    if "?" in key:
        key = key.split("?")[0].split("/offria/")[-1]

    from app.storage import minio_client as mc
    url = mc.presigned_get(key)
    return {"url": url}


@router.post("/{ao_id}/start-pipeline", response_model=AoStatus)
async def start_pipeline(
    ao_id: str,
    current_user: UserPublic = Depends(get_current_user),
) -> AoStatus:
    """Lance la tâche Celery dummy (Phase 4a) ou le pipeline réel (Phase 4c+)."""
    org_id = current_user.org_id or current_user.id

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AppelOffre).where(AppelOffre.id == ao_id, AppelOffre.org_id == org_id)
        )
        ao = result.scalar_one_or_none()
        if not ao:
            raise HTTPException(status_code=404, detail="Appel d'offres introuvable.")

        if ao.statut not in ("brouillon", "erreur"):
            raise HTTPException(
                status_code=409,
                detail=f"Pipeline déjà en cours ou terminé (statut: {ao.statut}).",
            )

        ao.statut = "en_analyse"
        ao.pipeline_pct = 0
        ao.erreur_message = None
        ao.updated_at = _now_iso()
        await session.commit()

    # Vérifier que le profil entreprise est complet avant de lancer
    from app.db.models import CompanyProfile
    from sqlalchemy import select as sa_select
    _REQUIRED = ["nom_entreprise", "ice", "gerant_nom", "gerant_prenom", "adresse"]
    async with AsyncSessionLocal() as session:
        prof_result = await session.execute(
            sa_select(CompanyProfile).where(CompanyProfile.org_id == org_id)
        )
        profile = prof_result.scalar_one_or_none()

    if not profile:
        raise HTTPException(
            status_code=422,
            detail="Profil entreprise non configuré. Renseignez votre profil dans le Dashboard avant de lancer le pipeline.",
        )

    manquants = [f for f in _REQUIRED if not getattr(profile, f, "")]
    if manquants:
        raise HTTPException(
            status_code=422,
            detail=f"Profil incomplet. Champs manquants : {', '.join(manquants)}. Complétez votre profil dans le Dashboard.",
        )

    from celery import chain
    from app.tasks.ao_tasks import (
        task_classify_uploads, task_analyze_ao_context, task_build_pipeline,
    )

    # Pipeline complet : classify → analyze (CPS+RC → analyse_json) → build_pipeline (chord dynamique)
    chain(
        task_classify_uploads.si(ao_id),
        task_analyze_ao_context.si(ao_id),
        task_build_pipeline.si(ao_id),
    ).delay()

    logger.info("Pipeline démarré: ao=%s", ao_id)
    return AoStatus(id=ao_id, statut="en_analyse", pipeline_pct=0, erreur_message=None)


@router.post("/{ao_id}/cancel", response_model=AoStatus)
async def cancel_pipeline(
    ao_id: str,
    current_user: UserPublic = Depends(get_current_user),
) -> AoStatus:
    """Annule un pipeline en cours et remet le statut à 'erreur' pour permettre une relance."""
    org_id = current_user.org_id or current_user.id
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AppelOffre).where(AppelOffre.id == ao_id, AppelOffre.org_id == org_id)
        )
        ao = result.scalar_one_or_none()
        if not ao:
            raise HTTPException(status_code=404, detail="Appel d'offres introuvable.")

        ao.statut = "erreur"
        ao.erreur_message = "Pipeline annulé manuellement."
        ao.pipeline_pct = 0
        ao.updated_at = _now_iso()
        await session.commit()

    logger.info("Pipeline annulé: ao=%s org=%s", ao_id, org_id)
    return AoStatus(id=ao_id, statut="erreur", pipeline_pct=0, erreur_message="Pipeline annulé manuellement.")


@router.delete("/{ao_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ao(
    ao_id: str,
    current_user: UserPublic = Depends(get_current_user),
) -> None:
    org_id = current_user.org_id or current_user.id
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AppelOffre)
            .where(AppelOffre.id == ao_id, AppelOffre.org_id == org_id)
            .options(selectinload(AppelOffre.documents))
        )
        ao = result.scalar_one_or_none()
        if not ao:
            raise HTTPException(status_code=404, detail="Appel d'offres introuvable.")

        from app.storage import minio_client as mc
        from app.db.models import AoTeamMember
        from sqlalchemy import delete as sa_delete

        for doc in ao.documents:
            if doc.minio_key:
                try:
                    key = doc.minio_key
                    if "?" in key:
                        key = key.split("?")[0].split("/offria/")[-1]
                    mc.delete_file(key)
                except Exception:
                    pass

        await session.execute(sa_delete(AoTeamMember).where(AoTeamMember.ao_id == ao_id))
        await session.delete(ao)
        await session.commit()

    logger.info("AO supprimé: %s org=%s", ao_id, org_id)
