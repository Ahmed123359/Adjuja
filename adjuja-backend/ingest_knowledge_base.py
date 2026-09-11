"""
Ingestion unique de la base de connaissances (reglementation des marches publics +
guide de la plateforme ADJUJA) dans la collection Qdrant globale `offria_kb`, celle que
RagService.retrieve_for_chat() interroge pour l'assistant conversationnel.

A relancer a chaque fois qu'un des 3 documents source change -- idempotent : chaque
chunk recoit un id UUID5 derive de (doc_type, doc_name, index), un nouveau run met a
jour les memes points au lieu d'en dupliquer.

Ne reutilise pas RagService.index_document() : cette methode ecrit toujours dans
offria_kb_{org_id} (jamais offria_kb), fige doc_type="note_metho", et re-decoupe le
texte par paragraphe en interne -- incompatible avec les decisions de cette feature
(collection globale, vrai doc_type, texte deja decoupe par Article/section). Ce script
embed + upsert directement contre le client Qdrant de RagService.

Pre-requis : QDRANT_URL et MISTRAL_API_KEY dans l'environnement (meme config que
RagService en prod), tesseract-ocr-fra + poppler-utils installes -- deja presents dans
l'image Docker de l'API, executer dedans si absents sur l'hote :

    docker compose -f ../adjuja-infra/docker-compose.yml exec api python ingest_knowledge_base.py
"""
import asyncio
import re
import uuid
from pathlib import Path

import docx
import pytesseract
from pdf2image import convert_from_path
from qdrant_client.models import Distance, PointStruct, VectorParams

# Les documents source vivent dans le depot voisin adjuja-docs, clone cote a cote
# par adjuja-infra/scripts/clone.sh. Chemin resolu depuis ce fichier, pas depuis
# le cwd, pour que le script marche aussi lance depuis ailleurs.
_DOCS = Path(__file__).resolve().parent.parent / "adjuja-docs"

from app.config.settings import get_settings
from app.services.rag_service import _COLLECTION, RagService

ARTICLE_BOUNDARY = re.compile(
    r"(?=ARTICLE\s+\d+|Article\s+(?:\d+|premier)\s*:?|ART\.\s*\d+)"
)

# Namespace fixe pour des UUID5 stables entre deux runs (idempotence).
_ID_NAMESPACE = uuid.UUID("a1c3f6b2-2b3f-4d6a-9c9e-8f1a2b3c4d5e")


def extract_decree_pdf(path: str) -> str:
    """decret_des_marches_publics : texte vectoriel non extractible (confirme : chaque
    glyphe est une courbe dessinee, pas un objet texte). On rend chaque page en image
    et on l'OCR, meme chaine d'outils que app/services/filler/filler_page_detector.py."""
    images = convert_from_path(path, dpi=200)
    return "\n\n".join(pytesseract.image_to_string(img, lang="fra") for img in images)


def extract_docx(path: str) -> str:
    d = docx.Document(path)
    return "\n\n".join(p.text for p in d.paragraphs if p.text.strip())


def chunk_by_article(text: str, doc_name: str) -> list[str]:
    """Un chunk = un Article complet (citabilite juridique). Texte OCR bruite --
    verifier le nombre de chunks obtenus contre le nombre reel d'articles apres
    execution, ne pas supposer correct sans verification."""
    return [p.strip() for p in ARTICLE_BOUNDARY.split(text) if len(p.strip()) > 50]


def chunk_by_heading(text: str, doc_name: str) -> list[str]:
    """guide_plateforme_adjuja.md : un chunk = une section '## ', decoupage aligne sur
    la structure volontaire du fichier."""
    return [p.strip() for p in re.split(r"(?=^## )", text, flags=re.MULTILINE) if len(p.strip()) > 50]


async def _ensure_collection(rag: RagService) -> None:
    try:
        await rag._client.get_collection(_COLLECTION)  # type: ignore[union-attr]
    except Exception:
        await rag._client.create_collection(  # type: ignore[union-attr]
            collection_name=_COLLECTION,
            vectors_config=VectorParams(size=1024, distance=Distance.COSINE),
        )


async def index_chunks(rag: RagService, doc_type: str, doc_name: str, chunks: list[str]) -> int:
    points = []
    for i, chunk in enumerate(chunks):
        try:
            vector = await rag._embed(chunk)  # type: ignore[attr-defined]
        except Exception as exc:
            print(f"  chunk {i} embed echoue : {exc}")
            continue
        point_id = str(uuid.uuid5(_ID_NAMESPACE, f"{doc_type}_{doc_name}_{i}"))
        payload = {"content": chunk, "doc_name": doc_name, "doc_type": doc_type}
        points.append(PointStruct(id=point_id, vector=vector, payload=payload))

    if not points:
        return 0

    await rag._client.upsert(collection_name=_COLLECTION, points=points)  # type: ignore[union-attr]
    return len(points)


async def main() -> None:
    settings = get_settings()
    rag = RagService(qdrant_url=settings.qdrant_url, mistral_api_key=settings.mistral_api_key)

    if not rag.is_ready:
        print("RAG non configure (QDRANT_URL ou MISTRAL_API_KEY manquant) -- abandon.")
        return

    if not _DOCS.is_dir():
        print(
            f"Depot adjuja-docs introuvable ({_DOCS}). Les documents source "
            "vivent dans un depot voisin : lancer adjuja-infra/scripts/clone.sh "
            "pour que adjuja-backend/ et adjuja-docs/ soient cote a cote. Abandon."
        )
        return

    await _ensure_collection(rag)

    sources = [
        (
            _DOCS / "hafid-taches-docs/chatbot/decret_des_marches_publics_version_francais.pdf",
            extract_decree_pdf, chunk_by_article,
            "Decret n2-22-431 relatif aux marches publics", "reglementation",
        ),
        (
            _DOCS / "hafid-taches-docs/chatbot/2-16-344+interets+moratoires.pdf.docx",
            extract_docx, chunk_by_article,
            "Decret n2-16-344, delais de paiement et interets moratoires", "reglementation",
        ),
        (
            _DOCS / "hafid-taches-docs/chatbot/guide_plateforme_adjuja.md",
            lambda p: open(p, encoding="utf-8").read(), chunk_by_heading,
            "Guide de la plateforme ADJUJA", "plateforme",
        ),
    ]

    for path, extract, chunker, doc_name, doc_type in sources:
        print(f"Extraction : {doc_name} ({path})")
        text = extract(path)
        chunks = chunker(text, doc_name)
        print(f"  {len(chunks)} chunks")
        indexed = await index_chunks(rag, doc_type, doc_name, chunks)
        print(f"  {indexed} chunks indexes dans {_COLLECTION}")


if __name__ == "__main__":
    asyncio.run(main())
