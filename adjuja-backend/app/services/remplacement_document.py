"""Remplacement d'un document genere ou rempli par la version corrigee de
l'utilisateur (mode accompagne, etapes 5 Redaction et 6 Remplissage).

Spec : context/feature-spec/mode-accompagne/api.md, « Corrections apportees par
l'utilisateur » : la note amendee remplace le document genere et l'etape 7
compile CELLE-LA, jamais une regeneration.

Deux pieges traites ici :
- un document genere existe en deux versions (Word et PDF). Remplacer seulement
  le Word laissait l'ancien PDF, et c'est lui que task_sign_and_compile signe et
  met dans le ZIP (elle ne signe que les PDF). Toutes les versions generees du
  type sont donc retirees ;
- une version Word corrigee est convertie en PDF (LibreOffice), sinon elle
  entrerait dans le ZIP sans signature ni cachet.
"""

import asyncio
import io
import logging
import tempfile
import uuid
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

from app.db.base import AsyncSessionLocal
from app.db.models import AoDocument, AoPipelineStep, AppelOffre

logger = logging.getLogger(__name__)

# Origines qu'un remplacement peut retirer : produites par le pipeline, ou deja
# corrigees une premiere fois. Jamais les documents sources (`upload`).
ORIGINES_REMPLACABLES = ("genere", "rempli", "modifie")

MIME_PDF = "application/pdf"
MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


class RemplacementRefuse(Exception):
    """Refus explique a l'utilisateur ; `code` est le statut HTTP a renvoyer."""

    def __init__(self, message: str, code: int) -> None:
        super().__init__(message)
        self.code = code


@dataclass
class Remplacement:
    documents: list[AoDocument]
    signable: bool  # un PDF existe : l'etape 7 pourra le signer


def type_fichier(data: bytes) -> str | None:
    """« pdf », « docx » ou None, d'apres le contenu et non le nom du fichier."""
    if data.startswith(b"%PDF-"):
        return "pdf"
    if data.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                if "word/document.xml" in zf.namelist():
                    return "docx"
        except zipfile.BadZipFile:
            return None
    return None


def _docx_vers_pdf(data: bytes) -> bytes | None:
    """Conversion LibreOffice ; None si elle echoue (outil absent, fichier illisible)."""
    from app.services.filler.filler_processors import convert_docx_to_pdf

    with tempfile.TemporaryDirectory() as dossier:
        source = Path(dossier) / "document.docx"
        cible = Path(dossier) / "document.pdf"
        source.write_bytes(data)
        if not convert_docx_to_pdf(source, cible):
            return None
        return cible.read_bytes()


def _maintenant() -> str:
    return datetime.now(timezone.utc).isoformat()


async def remplacer_document(ao_id: str, org_id: str, doc_type: str, nom_fichier: str, data: bytes) -> Remplacement:
    genre = type_fichier(data)
    if genre is None:
        raise RemplacementRefuse("Seuls les fichiers PDF ou Word (.docx) sont acceptés.", 400)

    from app.storage import minio_client as mc

    async with AsyncSessionLocal() as session:
        ao = (await session.execute(
            select(AppelOffre).where(AppelOffre.id == ao_id, AppelOffre.org_id == org_id)
        )).scalar_one_or_none()
        if not ao:
            raise RemplacementRefuse("Appel d'offres introuvable.", 404)

        # Une tache qui tourne ecrit dans les memes lignes : attendre qu'elle finisse.
        en_cours = (await session.execute(
            select(AoPipelineStep.id).where(AoPipelineStep.ao_id == ao_id, AoPipelineStep.statut == "en_cours")
        )).first()
        if en_cours:
            raise RemplacementRefuse("Une étape est en cours : attendez qu'elle se termine pour remplacer ce document.", 409)

        existants = (await session.execute(
            select(AoDocument).where(
                AoDocument.ao_id == ao_id,
                AoDocument.doc_type == doc_type,
                AoDocument.origine.in_(ORIGINES_REMPLACABLES),
            )
        )).scalars().all()
        if not existants:
            raise RemplacementRefuse("Aucun document produit de ce type à remplacer.", 404)
        dossier = existants[0].dossier
        for doc in existants:
            await session.delete(doc)

        versions: list[tuple[bytes, str, str]] = []  # (octets, extension, type MIME)
        if genre == "pdf":
            versions.append((data, "pdf", MIME_PDF))
        else:
            versions.append((data, "docx", MIME_DOCX))
            pdf = await asyncio.to_thread(_docx_vers_pdf, data)  # LibreOffice : hors boucle
            if pdf:
                versions.append((pdf, "pdf", MIME_PDF))
            else:
                logger.warning("[remplacement] conversion PDF echouee ao=%s type=%s", ao_id, doc_type)

        base = Path(nom_fichier).stem or doc_type
        ajoutes: list[AoDocument] = []
        for octets, ext, mime in versions:
            cle = f"{org_id}/ao/{ao_id}/{dossier}/modifie/{doc_type}.{ext}"
            mc.upload_bytes(cle, octets, mime)
            doc = AoDocument(
                id=str(uuid.uuid4()),
                ao_id=ao_id,
                created_at=_maintenant(),
                dossier=dossier,
                doc_type=doc_type,
                origine="modifie",
                statut="traite",
                minio_key=cle,
                nom_fichier=f"{base}.{ext}",
                taille_octets=len(octets),
            )
            session.add(doc)
            ajoutes.append(doc)
        ao.updated_at = _maintenant()
        await session.commit()

    logger.info("[remplacement] ao=%s type=%s versions=%s", ao_id, doc_type, [v[1] for v in versions])
    return Remplacement(documents=ajoutes, signable=any(v[1] == "pdf" for v in versions))
