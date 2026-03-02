"""
Service RAG ETL — microservice indépendant de l'application principale.

Responsabilité : uniquement l'indexation (écriture dans Qdrant).
La lecture (query) est gérée directement par le service principal.

Routes :
  GET  /health   — liveness probe
  GET  /status   — état de l'index (manifest + collection Qdrant)
  POST /index    — déclenche l'ETL (n'indexe que les nouveaux fichiers)
  DELETE /reset  — vide complètement la collection et le manifest

Démarrage :
  uvicorn main:app --host 0.0.0.0 --port 8001
  docker compose --profile rag up rag-etl
"""
import logging
import sys
from pathlib import Path

import openai
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

from config import get_settings
from etl import ETLPipeline, DOCUMENT_TYPES
from manifest import Manifest

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

# ── Initialisation ────────────────────────────────────────────────────────

settings = get_settings()

if not settings.openai_api_key:
    logger.error("OPENAI_API_KEY manquante — le service ETL ne peut pas générer d'embeddings.")

qdrant = QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)
openai_client = openai.OpenAI(api_key=settings.openai_api_key)

kb_path = Path(settings.knowledge_base_path)
manifest = Manifest(kb_path / ".rag_manifest.json")

etl = ETLPipeline(
    settings=settings,
    qdrant=qdrant,
    openai_client=openai_client,
    manifest=manifest,
)

# ── Application FastAPI ───────────────────────────────────────────────────

app = FastAPI(
    title="OffrIA — RAG ETL Service",
    description=(
        "Microservice d'indexation de la base de connaissances. "
        "Charge les documents de knowledge_base/, génère les embeddings OpenAI "
        "et les stocke dans Qdrant. N'indexe que les fichiers nouveaux ou modifiés."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routes ────────────────────────────────────────────────────────────────

@app.get("/health", tags=["Santé"])
def health() -> dict:
    """Liveness probe."""
    return {"status": "ok", "service": "rag-etl"}


@app.get("/status", tags=["Statut"])
def status() -> dict:
    """
    Retourne l'état complet du service :
    - Connexion Qdrant
    - Nombre de vecteurs dans la collection
    - Détail du manifest (fichiers indexés)
    """
    result: dict = {
        "qdrant_available": False,
        "collection_exists": False,
        "vectors_count": 0,
        "indexed_files": 0,
        "document_types": DOCUMENT_TYPES,
        "manifest": {},
    }

    try:
        collections = qdrant.get_collections()
        result["qdrant_available"] = True

        collection_names = {c.name for c in collections.collections}
        result["collection_exists"] = settings.collection_name in collection_names

        if result["collection_exists"]:
            info = qdrant.get_collection(settings.collection_name)
            result["vectors_count"] = info.vectors_count or 0

    except Exception as exc:
        result["qdrant_error"] = str(exc)

    entries = manifest.all_entries()
    result["indexed_files"] = len(entries)
    result["manifest"] = {
        k: {
            "doc_type":    v.doc_type,
            "chunk_count": v.chunk_count,
            "indexed_at":  v.indexed_at,
            "sha256_short": v.sha256[:12] + "…",
        }
        for k, v in entries.items()
    }

    return result


@app.post("/index", tags=["ETL"])
def index_documents() -> dict:
    """
    Déclenche le pipeline ETL complet.

    - Crée la collection Qdrant si nécessaire
    - Compare les fichiers au manifest (SHA256)
    - Indexe uniquement les fichiers nouveaux ou modifiés
    - Supprime les entrées dont les fichiers ont été effacés

    Returns:
        Rapport avec le nombre de fichiers indexés, ignorés, supprimés et les erreurs.
    """
    try:
        etl.ensure_collection()
        report = etl.run()
        return {
            "success": True,
            "report": report,
            "message": (
                f"{report['indexed']} fichier(s) indexé(s), "
                f"{report['skipped']} ignoré(s), "
                f"{report['deleted']} supprimé(s)"
                + (f", {len(report['errors'])} erreur(s)" if report["errors"] else "")
            ),
        }
    except Exception as exc:
        logger.error("Erreur ETL : %s", exc, exc_info=True)
        return {"success": False, "error": str(exc)}


@app.delete("/reset", tags=["ETL"])
def reset_index() -> dict:
    """
    Réinitialise complètement l'index :
    - Recrée la collection Qdrant (tous les vecteurs sont effacés)
    - Vide le manifest (tous les fichiers seront réindexés au prochain /index)
    """
    try:
        # Recrée la collection (drop + create)
        collection_names = {c.name for c in qdrant.get_collections().collections}
        if settings.collection_name in collection_names:
            qdrant.delete_collection(settings.collection_name)

        qdrant.create_collection(
            collection_name=settings.collection_name,
            vectors_config=VectorParams(
                size=settings.embedding_dimensions,
                distance=Distance.COSINE,
            ),
        )

        manifest.clear()
        return {"success": True, "message": "Index réinitialisé. Lancez POST /index pour réindexer."}

    except Exception as exc:
        logger.error("Erreur reset : %s", exc, exc_info=True)
        return {"success": False, "error": str(exc)}
