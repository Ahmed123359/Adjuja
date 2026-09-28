import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from typing import Annotated
from sqlalchemy import delete as sa_delete, select
from sqlalchemy.orm import selectinload

from app.api.dependencies import get_current_user, get_fit_score_service, require_within_limit
from app.db.base import AsyncSessionLocal
from app.db.models import AoDocument, AoPipelineStep, AppelOffre, CompanyDocument, CompanyProfile, StaffCv
from app.api.routes.chat_routes import get_chat_service
from app.models.ao_pipeline import (
    AoCreate, AoDocumentOut, AoResponse, AoStatus, AoStepOut, AoSummary, AoUpdate,
    StartPipelinePayload, StepAssistPayload, StepAssistResponse, ValidateStepPayload,
)
from app.models.chat import ChatMessage
from app.models.generation import ProviderEnum
from app.models.user import UserPublic
from app.services.chat_service import ChatService
from app.services.eligibility_service import compute_verdict
from app.services.fit_score_service import AoContext, FitScoreService
from app.services import pipeline_steps_service as steps_svc
from app.services import step_assist_service as assist_svc
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
        mode=ao.mode or "express",
        date_limite=ao.date_limite,
        erreur_message=ao.erreur_message,
        analyse_json=ao.analyse_json,
        custom_instructions=ao.custom_instructions,
        documents=[_doc_to_out(d) for d in ao.documents],
    )


@router.post(
    "", response_model=AoSummary, status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_within_limit("ao_per_month"))],
)
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
            date_limite=body.date_limite,
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
        date_limite=body.date_limite,
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
    # Contexte de l'AO pour le fit score (optionnels : un appelant qui ne les
    # envoie pas obtient le meme verdict qu'avant, avec un score moins complet).
    objet: str | None = None
    region: str | None = None
    ville: str | None = None


async def _fit_score(
    fit: FitScoreService, org_id: str, analyse_json: dict, ctx: AoContext,
) -> dict:
    """Charge profil, CV actifs et documents permanents de l'org, puis calcule
    le fit score (spec context/feature-spec/fit-score/api.md)."""
    async with AsyncSessionLocal() as session:
        profile = (await session.execute(
            select(CompanyProfile).where(CompanyProfile.org_id == org_id)
        )).scalar_one_or_none()
        staff = list((await session.execute(
            select(StaffCv).where(StaffCv.org_id == org_id, StaffCv.actif.is_(True))
        )).scalars().all())
        documents = list((await session.execute(
            select(CompanyDocument).where(CompanyDocument.org_id == org_id)
        )).scalars().all())
    return await fit.compute(analyse_json, ctx, profile, staff, documents, org_id)


@router.post(
    "/from-watcher", response_model=AoSummary, status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_within_limit("ao_per_month"))],
)
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
            # Recue par FromWatcherPayload depuis toujours, jamais stockee avant
            # la migration 014 : l'echeance d'un AO importe etait perdue.
            date_limite=body.date_limite,
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
        date_limite=body.date_limite,
    )


@router.post("/eligibility-check")
async def eligibility_check(
    body: EligibilityCheckPayload,
    current_user: UserPublic = Depends(get_current_user),
    fit: FitScoreService = Depends(get_fit_score_service),
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
    verdict = compute_verdict(body.analyse_json, body.date_limite, extra)
    # Champ ajoute, rien de retire : un appelant qui ne lit que verdict /
    # raisons / details ne voit aucune difference.
    verdict["fit_score"] = await _fit_score(
        fit, org_id, body.analyse_json,
        AoContext(objet=body.objet or "", region=body.region, ville=body.ville, date_limite=body.date_limite),
    )
    return verdict


@router.get("/{ao_id}/fit-score")
async def get_fit_score(
    ao_id: str,
    current_user: UserPublic = Depends(get_current_user),
    fit: FitScoreService = Depends(get_fit_score_service),
) -> dict:
    """Fit score d'un AO du pipeline (analyse_json propre a l'org)."""
    org_id = current_user.org_id or current_user.id
    async with AsyncSessionLocal() as session:
        ao = (await session.execute(
            select(AppelOffre).where(AppelOffre.id == ao_id, AppelOffre.org_id == org_id)
        )).scalar_one_or_none()
    if ao is None:
        raise HTTPException(status_code=404, detail="Appel d'offres introuvable.")
    if not ao.analyse_json:
        raise HTTPException(status_code=409, detail="Cet appel d'offres n'a pas encore ete analyse.")
    return await _fit_score(
        fit, org_id, ao.analyse_json,
        AoContext(objet=ao.objet or "", date_limite=ao.date_limite),
    )


@router.get("", response_model=list[AoSummary])
async def list_ao(
    current_user: UserPublic = Depends(get_current_user),
    limit: int = 100,
    offset: int = 0,
) -> list[AoSummary]:
    org_id = current_user.org_id or current_user.id
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AppelOffre)
            .where(AppelOffre.org_id == org_id)
            .order_by(AppelOffre.created_at.desc())
            .limit(min(limit, 200))
            .offset(offset)
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
            mode=ao.mode or "express",
            date_limite=ao.date_limite,
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


@router.patch("/{ao_id}", response_model=AoSummary)
async def update_ao(
    ao_id: str,
    body: AoUpdate,
    current_user: UserPublic = Depends(get_current_user),
) -> AoSummary:
    """Correction manuelle des informations d'un AO.

    Volontairement limitee aux champs saisis par l'utilisateur : `statut`,
    `pipeline_pct` et `mode` appartiennent au pipeline et changeraient son
    comportement s'ils etaient modifiables depuis l'exterieur.
    """
    org_id = current_user.org_id or current_user.id
    champs = body.model_dump(exclude_unset=True)
    if not champs:
        raise HTTPException(status_code=400, detail="Aucun champ a modifier.")

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AppelOffre).where(AppelOffre.id == ao_id, AppelOffre.org_id == org_id)
        )
        ao = result.scalar_one_or_none()
        if not ao:
            raise HTTPException(status_code=404, detail="Appel d'offres introuvable.")

        for champ, valeur in champs.items():
            setattr(ao, champ, valeur)
        ao.updated_at = _now_iso()
        await session.commit()

        logger.info("AO modifie: %s org=%s champs=%s", ao_id, org_id, list(champs))
        return AoSummary(
            id=ao.id,
            reference=ao.reference,
            acheteur=ao.acheteur,
            objet=ao.objet,
            statut=ao.statut,
            pipeline_pct=ao.pipeline_pct,
            created_at=ao.created_at,
            updated_at=ao.updated_at,
            mode=ao.mode or "express",
            date_limite=ao.date_limite,
        )


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
    if not pdf_bytes.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Le fichier n'est pas un PDF valide.")
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
            if not pdf_bytes.startswith(b"%PDF-"):
                raise HTTPException(status_code=400, detail=f"Fichier PDF invalide : {file.filename}")
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


class RemplacementOut(BaseModel):
    documents: list[AoDocumentOut]
    # Faux si la version Word n'a pas pu etre convertie en PDF : l'etape 7 ne
    # pourra pas la signer, l'ecran le dit.
    signable: bool


@router.post("/{ao_id}/documents/replace", response_model=RemplacementOut)
async def replace_document(
    ao_id: str,
    file: UploadFile,
    doc_type: Annotated[str, Form()],
    current_user: UserPublic = Depends(get_current_user),
) -> RemplacementOut:
    """Remplace un document produit (note, formulaire rempli) par la version
    corrigee de l'utilisateur, PDF ou Word. C'est elle que l'etape 7 signe."""
    from app.services.remplacement_document import RemplacementRefuse, remplacer_document

    org_id = current_user.org_id or current_user.id
    data = await file.read()
    validate_upload_size(data, file.filename or "document")
    try:
        resultat = await remplacer_document(ao_id, org_id, doc_type, file.filename or doc_type, data)
    except RemplacementRefuse as exc:
        raise HTTPException(status_code=exc.code, detail=str(exc)) from exc
    return RemplacementOut(documents=[_doc_to_out(d) for d in resultat.documents], signable=resultat.signable)


@router.post("/{ao_id}/start-pipeline", response_model=AoStatus)
async def start_pipeline(
    ao_id: str,
    body: StartPipelinePayload | None = None,
    current_user: UserPublic = Depends(get_current_user),
) -> AoStatus:
    """Lance le traitement d'un AO dans l'un des deux régimes.

    express (défaut) : la chain Celery existante, un clic jusqu'au ZIP signé.
    accompagne : les 7 étapes sont créées et seule la première est lancée, chacune
    attendant ensuite une validation explicite.
    """
    org_id = current_user.org_id or current_user.id
    mode = (body.mode if body else "express") or "express"
    if mode not in ("express", "accompagne"):
        raise HTTPException(status_code=422, detail="Mode de traitement inconnu.")

    _REQUIRED = ["nom_entreprise", "ice", "gerant_nom", "gerant_prenom", "adresse"]
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

        prof_result = await session.execute(
            select(CompanyProfile).where(CompanyProfile.org_id == org_id)
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

        ao.statut = "en_analyse"
        ao.pipeline_pct = 0
        ao.erreur_message = None
        ao.mode = mode
        ao.updated_at = _now_iso()

        if mode == "accompagne":
            # Relance d'un AO en erreur : repartir d'un parcours propre.
            await session.execute(
                sa_delete(AoPipelineStep).where(AoPipelineStep.ao_id == ao_id)
            )
            await steps_svc.create_steps_for_ao(session, ao_id)

        await session.commit()

    if mode == "accompagne":
        # Une seule étape lancée, pas de chain : c'est toute la différence.
        await steps_svc.open_step(ao_id, "documents")
        logger.info("Pipeline accompagné démarré: ao=%s", ao_id)
        return AoStatus(id=ao_id, statut="en_analyse", pipeline_pct=0, erreur_message=None)

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


# ---------------------------------------------------------------------------
# Mode accompagné : parcours en 7 étapes
# ---------------------------------------------------------------------------

async def _assert_ao_belongs_to_org(ao_id: str, org_id: str) -> None:
    """Garde d'appartenance, identique aux routes AO voisines."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AppelOffre.id).where(AppelOffre.id == ao_id, AppelOffre.org_id == org_id)
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Appel d'offres introuvable.")


@router.get("/{ao_id}/steps", response_model=list[AoStepOut])
async def get_ao_steps(
    ao_id: str,
    current_user: UserPublic = Depends(get_current_user),
) -> list[AoStepOut]:
    """Le parcours d'un AO en mode accompagné.

    Retourne une liste vide pour un AO en mode express : ce n'est pas une erreur,
    le frontend affiche alors l'écran de progression habituel.
    """
    org_id = current_user.org_id or current_user.id
    await _assert_ao_belongs_to_org(ao_id, org_id)

    steps = await steps_svc.list_steps(ao_id)
    return [
        AoStepOut(
            step_key=s.step_key,
            step_order=s.step_order,
            statut=s.statut,
            applicable=s.applicable,
            erreur_message=s.erreur_message,
            started_at=s.started_at,
            completed_at=s.completed_at,
            validated_at=s.validated_at,
            validated_by=s.validated_by,
        )
        for s in steps
    ]


@router.post("/{ao_id}/steps/{step_key}/validate", response_model=list[AoStepOut])
async def validate_ao_step(
    ao_id: str,
    step_key: str,
    body: ValidateStepPayload | None = None,
    current_user: UserPublic = Depends(get_current_user),
) -> list[AoStepOut]:
    """Valide une étape et ouvre la suivante. C'est la porte du mode accompagné."""
    org_id = current_user.org_id or current_user.id
    await _assert_ao_belongs_to_org(ao_id, org_id)

    if step_key not in steps_svc.STEP_KEYS:
        raise HTTPException(status_code=404, detail="Étape inconnue.")

    try:
        await steps_svc.validate_step(
            ao_id, step_key, current_user.id, body.corrections if body else None
        )
    except steps_svc.StepError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)

    return await get_ao_steps(ao_id, current_user)


@router.post("/{ao_id}/steps/{step_key}/rerun", response_model=list[AoStepOut])
async def rerun_ao_step(
    ao_id: str,
    step_key: str,
    current_user: UserPublic = Depends(get_current_user),
) -> list[AoStepOut]:
    """Relance une étape, sur incident ou en retour en arrière volontaire.

    Un retour en arrière invalide toutes les étapes suivantes, qui seront à refaire.
    """
    org_id = current_user.org_id or current_user.id
    await _assert_ao_belongs_to_org(ao_id, org_id)

    if step_key not in steps_svc.STEP_KEYS:
        raise HTTPException(status_code=404, detail="Étape inconnue.")

    try:
        await steps_svc.rerun_step(ao_id, step_key)
    except steps_svc.StepError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)

    return await get_ao_steps(ao_id, current_user)


@router.get("/{ao_id}/steps/{step_key}/assist", response_model=dict)
async def get_step_assist_context(
    ao_id: str,
    step_key: str,
    current_user: UserPublic = Depends(get_current_user),
) -> dict:
    """Ce que l'assistant sait et peut faire à cette étape.

    Sert au frontend à présenter l'assistant avant la première question, sans
    consommer d'appel LLM.
    """
    org_id = current_user.org_id or current_user.id
    if step_key not in steps_svc.STEP_KEYS:
        raise HTTPException(status_code=404, detail="Étape inconnue.")

    ao = await assist_svc.load_ao_for_assist(ao_id, org_id)
    if not ao:
        raise HTTPException(status_code=404, detail="Appel d'offres introuvable.")

    return {
        "step_key": step_key,
        "role": assist_svc.STEP_ROLES.get(step_key, ""),
        "objet": ao.objet,
        "acheteur": ao.acheteur,
        "suggestions": assist_svc.STEP_SUGGESTIONS.get(step_key, []),
        "history": await assist_svc.history(ao_id, org_id, step_key),
    }


@router.post("/{ao_id}/steps/{step_key}/assist", response_model=StepAssistResponse)
async def post_step_assist(
    ao_id: str,
    step_key: str,
    body: StepAssistPayload,
    current_user: UserPublic = Depends(get_current_user),
    chat: ChatService = Depends(get_chat_service),
) -> StepAssistResponse:
    """Assistance IA contextualisée sur cet AO et cette étape.

    Réutilise ChatService (donc le même RAG réglementaire) avec un cadrage propre
    à l'étape : ce n'est pas un second système de conversation.
    """
    org_id = current_user.org_id or current_user.id
    if step_key not in steps_svc.STEP_KEYS:
        raise HTTPException(status_code=404, detail="Étape inconnue.")
    if not body.messages:
        raise HTTPException(status_code=422, detail="Aucune question posée.")

    ao = await assist_svc.load_ao_for_assist(ao_id, org_id)
    if not ao:
        raise HTTPException(status_code=404, detail="Appel d'offres introuvable.")

    verdict = None
    if step_key == "decision" and ao.analyse_json:
        async with AsyncSessionLocal() as session:
            prof = await session.execute(
                select(CompanyProfile).where(CompanyProfile.org_id == org_id)
            )
            profile = prof.scalar_one_or_none()
        verdict = compute_verdict(ao.analyse_json, None, profile.extra if profile and profile.extra else {})
        fit_detail = await _fit_score(
            get_fit_score_service(), org_id, ao.analyse_json,
            AoContext(objet=ao.objet or "", date_limite=ao.date_limite),
        )
        verdict["fit_score"] = {
            "score": fit_detail["score"],
            "eligibilite": fit_detail["eligibilite"],
            "facteurs": [
                {"facteur": f["code"], "score": f["score"], "justification": f["justification"]}
                for f in fit_detail["facteurs"] if f["exige"]
            ],
        }

    context = assist_svc.build_step_context(ao, step_key, verdict)
    history = [ChatMessage(role="user", content=context)]
    history += [
        ChatMessage(role=m.get("role", "user"), content=m.get("content", ""))
        for m in body.messages if m.get("content")
    ]

    try:
        provider = ProviderEnum(body.provider)
    except ValueError:
        raise HTTPException(status_code=422, detail="Provider LLM inconnu.")

    try:
        response = await chat.chat(messages=history, provider=provider, model=body.model)
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Assistance étape  ao=%s étape=%s erreur=%s", ao_id, step_key, exc, exc_info=True)
        raise HTTPException(status_code=502, detail=f"Erreur de l'assistant : {exc}")

    # La conversation survit au rechargement : sans cela, un dossier prepare sur
    # plusieurs jours obligeait a refaire chaque matin l'analyse de la veille.
    derniere_question = next(
        (m.get("content", "") for m in reversed(body.messages) if m.get("role") == "user"),
        "",
    )
    if derniere_question:
        await assist_svc.record(
            ao_id=ao_id, org_id=org_id, step_key=step_key,
            question=derniere_question, answer=response.answer,
            sources=response.sources, author_id=current_user.id,
        )

    return StepAssistResponse(answer=response.answer, sources=response.sources)


@router.delete("/{ao_id}/steps/{step_key}/assist", status_code=status.HTTP_204_NO_CONTENT)
async def clear_step_assist(
    ao_id: str,
    step_key: str,
    current_user: UserPublic = Depends(get_current_user),
) -> None:
    """Vide le fil de cette etape. Reprendre une analyse a zero est un geste
    legitime, et l'ancien contexte ne doit alors plus repartir au modele."""
    org_id = current_user.org_id or current_user.id
    if step_key not in steps_svc.STEP_KEYS:
        raise HTTPException(status_code=404, detail="Étape inconnue.")
    await _assert_ao_belongs_to_org(ao_id, org_id)
    await assist_svc.clear(ao_id, org_id, step_key)


@router.post("/{ao_id}/abandon", response_model=AoStatus)
async def abandon_ao_route(
    ao_id: str,
    current_user: UserPublic = Depends(get_current_user),
) -> AoStatus:
    """Refus explicite à l'étape Décision : l'AO est clos sans passer à la suite.

    Le statut abandonne est distinct d'erreur : ce n'est pas un échec.
    """
    org_id = current_user.org_id or current_user.id
    await _assert_ao_belongs_to_org(ao_id, org_id)

    try:
        await steps_svc.abandon_ao(ao_id, current_user.id)
    except steps_svc.StepError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)

    logger.info("AO abandonné à l'étape décision: ao=%s org=%s", ao_id, org_id)
    return AoStatus(id=ao_id, statut="abandonne", pipeline_pct=0, erreur_message=None)


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
