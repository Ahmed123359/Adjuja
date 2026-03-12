"""
Pipeline ETL RAG — charge, découpe, embed et stocke les documents.

Flux :
1. Scan knowledge_base/ par type de dossier
2. Compare avec le manifest (SHA256) → skip les fichiers déjà indexés
3. Charge le contenu (txt, md, pdf, docx)
4. Découpe en chunks avec chevauchement
5. Génère les embeddings via OpenAI (batch par fichier)
6. Upsert dans Qdrant (après suppression de l'ancienne version si modifié)
7. Met à jour le manifest

Dépendances optionnelles :
- pypdf      : lecture PDF   (pip install pypdf)
- python-docx: lecture Word  (pip install python-docx)
"""
from __future__ import annotations

import logging
import re
import uuid
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from pathlib import Path

_FILE_TIMEOUT_SECONDS = 30  # timeout max par fichier (lecture + embedding)

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    FilterSelector,
    MatchValue,
    PointStruct,
    VectorParams,
)

from config import RagSettings
from manifest import Manifest

logger = logging.getLogger(__name__)

# ── Constantes ────────────────────────────────────────────────────────────

DOCUMENT_TYPES: dict[str, str] = {
    "company":        "Présentation entreprise",
    "references":     "Références et réalisations",
    "templates":      "Modèles de réponses AO",
    "resources":      "Moyens humains et matériels",
    "certifications": "Certifications et qualifications",
}

SUPPORTED_EXT = {".txt", ".md", ".pdf", ".docx"}

# ── Chargement des fichiers ────────────────────────────────────────────────

try:
    import pypdf as _pypdf
    _PYPDF_OK = True
except ImportError:
    _pypdf = None  # type: ignore
    _PYPDF_OK = False

try:
    from docx import Document as _DocxDocument
    _DOCX_OK = True
except ImportError:
    _DocxDocument = None  # type: ignore
    _DOCX_OK = False


def _load_txt(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def _load_pdf(path: Path) -> str:
    if not _PYPDF_OK:
        logger.warning("pypdf absent — skip %s", path.name)
        return ""
    try:
        reader = _pypdf.PdfReader(str(path))
        return "\n".join(p.extract_text() or "" for p in reader.pages)
    except Exception as exc:
        logger.warning("Erreur lecture PDF %s : %s", path.name, exc)
        return ""


def _load_docx(path: Path) -> str:
    if not _DOCX_OK:
        logger.warning("python-docx absent — skip %s", path.name)
        return ""
    try:
        doc = _DocxDocument(str(path))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except Exception as exc:
        logger.warning("Erreur lecture DOCX %s : %s", path.name, exc)
        return ""


def _load_file(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in (".txt", ".md"):
        return _load_txt(path)
    if suffix == ".pdf":
        return _load_pdf(path)
    if suffix == ".docx":
        return _load_docx(path)
    return ""


# ── Chunking ──────────────────────────────────────────────────────────────

def _chunk_text(text: str, size: int, overlap: int) -> list[str]:
    """Découpe un texte en chunks de taille fixe avec chevauchement."""
    text = text.strip()
    if not text:
        return []
    step = size - overlap
    return [text[i:i+size] for i in range(0, len(text), step) if len(text[i:i+size]) > 50]


# ── Pipeline ETL ──────────────────────────────────────────────────────────

class ETLPipeline:
    """
    Pipeline ETL qui orchestre le chargement, le chunking, l'embedding
    et le stockage dans Qdrant pour tous les documents de knowledge_base/.
    """

    def __init__(
        self,
        settings: RagSettings,
        qdrant: QdrantClient,
        openai_client,
        manifest: Manifest,
    ) -> None:
        self._settings = settings
        self._qdrant = qdrant
        self._openai = openai_client
        self._manifest = manifest

    def ensure_collection(self) -> None:
        """Crée la collection Qdrant si elle n'existe pas encore."""
        existing = {c.name for c in self._qdrant.get_collections().collections}
        if self._settings.collection_name not in existing:
            self._qdrant.create_collection(
                collection_name=self._settings.collection_name,
                vectors_config=VectorParams(
                    size=self._settings.embedding_dimensions,
                    distance=Distance.COSINE,
                ),
            )
            logger.info("Collection Qdrant '%s' créée", self._settings.collection_name)

    def run(self) -> dict:
        """
        Exécute le pipeline ETL complet.

        - Skip les fichiers dont le SHA256 n'a pas changé
        - Re-indexe les fichiers modifiés (supprime puis réinsère)
        - Supprime du manifest les entrées pour les fichiers effacés

        Returns:
            Rapport d'exécution {indexed, skipped, deleted, errors}
        """
        kb_path = Path(self._settings.knowledge_base_path)
        report: dict = {"indexed": 0, "skipped": 0, "deleted": 0, "errors": []}

        # ── 1. Scan des fichiers courants ────────────────────────────────
        current_files: dict[str, Path] = {}
        for doc_type in DOCUMENT_TYPES:
            folder = kb_path / doc_type
            if not folder.is_dir():
                logger.info("[SCAN] Dossier absent, ignoré : %s/", doc_type)
                continue
            for path in sorted(folder.iterdir()):
                if path.suffix.lower() not in SUPPORTED_EXT:
                    continue
                if path.name.startswith("."):
                    continue
                if path.name.lower() == "readme.md":
                    continue
                rel_path = f"{doc_type}/{path.name}"
                current_files[rel_path] = path

        logger.info("[SCAN] %d fichier(s) trouvé(s) dans knowledge_base/", len(current_files))
        for rel_path in current_files:
            logger.info("  - %s", rel_path)

        # ── 2. Suppression des entrées orphelines (fichiers supprimés) ───
        for rel_path in list(self._manifest.all_entries().keys()):
            if rel_path not in current_files:
                self._delete_from_qdrant(rel_path)
                self._manifest.remove(rel_path)
                report["deleted"] += 1
                logger.info("[DELETE] Orphelin supprimé : %s", rel_path)

        # ── 3. Indexation des fichiers nouveaux ou modifiés ──────────────
        for rel_path, path in current_files.items():
            doc_type = rel_path.split("/")[0]
            try:
                file_hash = self._manifest.file_hash(path)
            except Exception as exc:
                logger.error("[ERROR] Impossible de lire %s : %s", rel_path, exc)
                report["errors"].append(f"{rel_path}: impossible de lire ({exc})")
                continue

            if self._manifest.is_indexed(rel_path, file_hash):
                report["skipped"] += 1
                logger.info("[SKIP]  %s (déjà indexé, inchangé)", rel_path)
                continue

            logger.info("[INDEX] %s — chargement...", rel_path)
            try:
                with ThreadPoolExecutor(max_workers=1) as executor:
                    future = executor.submit(self._process_file, rel_path, path, doc_type, file_hash)
                    n_chunks = future.result(timeout=_FILE_TIMEOUT_SECONDS)
                report["indexed"] += 1
                if n_chunks == 0:
                    logger.warning("[VIDE]  %s — texte vide, non indexé (PDF scanné ?)", rel_path)
                else:
                    logger.info("[OK]    %s — %d chunk(s) indexé(s)", rel_path, n_chunks)
            except FuturesTimeoutError:
                logger.error("[TIMEOUT] %s — dépasse %ds, fichier ignoré", rel_path, _FILE_TIMEOUT_SECONDS)
                report["errors"].append(f"{rel_path}: timeout ({_FILE_TIMEOUT_SECONDS}s)")
            except Exception as exc:
                logger.error("[ERROR] %s : %s", rel_path, exc, exc_info=True)
                report["errors"].append(f"{rel_path}: {exc}")

        logger.info(
            "[DONE] indexed=%d skipped=%d deleted=%d errors=%d",
            report["indexed"], report["skipped"], report["deleted"], len(report["errors"]),
        )
        return report

    # ── Méthodes internes ────────────────────────────────────────────────────

    def _process_file(
        self, rel_path: str, path: Path, doc_type: str, file_hash: str
    ) -> int:
        """Charge, découpe, embed et stocke un fichier. Retourne le nombre de chunks."""
        # Charge le texte
        text = _load_file(path)
        if not text.strip():
            logger.warning("Fichier vide, ignoré : %s", rel_path)
            return 0

        # Découpe en chunks
        chunks = _chunk_text(text, self._settings.chunk_size, self._settings.chunk_overlap)
        if not chunks:
            return 0

        # Génère les embeddings (batch unique par fichier)
        embeddings = self._embed_batch(chunks)

        # Supprime les anciennes versions dans Qdrant (si mise à jour)
        self._delete_from_qdrant(rel_path)

        # Insère les nouveaux points
        points = [
            PointStruct(
                id=str(uuid.uuid4()),
                vector=embedding,
                payload={
                    "content":   chunk,
                    "doc_name":  path.name,
                    "doc_type":  doc_type,
                    "rel_path":  rel_path,
                    "chunk_idx": idx,
                },
            )
            for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings))
        ]

        self._qdrant.upsert(
            collection_name=self._settings.collection_name,
            points=points,
        )

        # Met à jour le manifest
        self._manifest.record(rel_path, file_hash, doc_type, len(chunks))
        return len(chunks)

    def _delete_from_qdrant(self, rel_path: str) -> None:
        """Supprime tous les points Qdrant associés à un fichier."""
        try:
            self._qdrant.delete(
                collection_name=self._settings.collection_name,
                points_selector=FilterSelector(
                    filter=Filter(
                        must=[
                            FieldCondition(
                                key="rel_path",
                                match=MatchValue(value=rel_path),
                            )
                        ]
                    )
                ),
            )
        except Exception:
            pass  # La collection n'existe pas encore — ignoré

    def _embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Génère les embeddings pour une liste de textes via OpenAI."""
        # OpenAI accepte jusqu'à 2048 inputs par appel
        batch_size = 100
        all_embeddings: list[list[float]] = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i: i + batch_size]
            response = self._openai.embeddings.create(
                model=self._settings.embedding_model,
                input=batch,
            )
            all_embeddings.extend(d.embedding for d in response.data)

        return all_embeddings
