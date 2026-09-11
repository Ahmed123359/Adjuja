from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)

try:
    from qdrant_client import AsyncQdrantClient
    from qdrant_client.models import FieldCondition, Filter, MatchAny
    _QDRANT_OK = True
except ImportError:
    _QDRANT_OK = False
    logger.warning("qdrant-client non installé -> RAG désactivé.")

_MISTRAL_EMBED_URL = "https://api.mistral.ai/v1/embeddings"
_EMBED_MODEL       = "mistral-embed"

DOCUMENT_TYPES: dict[str, str] = {
    "references":     "Références et réalisations",
    "templates":      "Modèles de réponses AO",
    "certifications": "Certifications et qualifications",
    "company":        "Présentation entreprise",
    "resources":      "Moyens humains et matériels",
    "reglementation": "Réglementation des marchés publics",
    "plateforme":     "Guide de la plateforme ADJUJA",
}

_SECTION_TYPE_MAP: dict[str, list[str]] = {
    "Présentation de notre entreprise":       ["company", "certifications"],
    "Compréhension de vos besoins":           [],
    "Notre approche méthodologique":          ["templates"],
    "Moyens humains et techniques mobilisés": ["resources", "company", "certifications"],
    "Références similaires":                  ["references"],
    "Planning prévisionnel":                  ["templates"],
    "Proposition financière":                 ["templates"],
    "Conclusion et engagements":              ["company", "templates"],
}

_OT_SECTION_TYPE_MAP: dict[str, list[str]] = {
    "methodologie": ["templates"],
    "moyens":       ["resources", "company", "certifications"],
    "planning":     ["templates"],
    "rse":          ["company", "certifications"],
    "references":   ["references"],
}

_COLLECTION   = "offria_kb"
_N_CANDIDATES = 20
_RERANK_TOP_K = 3

_SECTION_TOP_K: dict[str, int] = {
    "Notre approche méthodologique":          5,
    "Moyens humains et techniques mobilisés": 5,
    "Références similaires":                  5,
    "Planning prévisionnel":                  4,
}

_QUERY_GEN_SYSTEM = (
    "Tu es un assistant de recherche documentaire. "
    "À partir d'un appel d'offres et d'un nom de section, génère une requête de recherche "
    "courte (10-20 mots, mots-clés uniquement) pour retrouver dans une base documentaire "
    "les extraits les plus pertinents. Retourne UNIQUEMENT la requête, sans ponctuation finale."
)

_RERANK_SYSTEM = (
    "You are a relevance scoring assistant. "
    "Given a query and a list of text chunks, identify the most relevant ones. "
    "Return ONLY a JSON array of integers (chunk indices), nothing else."
)


class RagService:
    def __init__(self, qdrant_url: str, mistral_api_key: str) -> None:
        self._client: object | None = None
        self._api_key = mistral_api_key

        if not _QDRANT_OK or not qdrant_url or not mistral_api_key:
            logger.info("RAG non configuré (QDRANT_URL ou MISTRAL_API_KEY manquant)")
            return

        try:
            self._client = AsyncQdrantClient(url=qdrant_url)
            logger.info("RAG initialisé  Qdrant: %s, embed: %s", qdrant_url, _EMBED_MODEL)
        except Exception as exc:
            logger.warning("Impossible d'initialiser le client RAG : %s", exc)

    @property
    def is_ready(self) -> bool:
        return self._client is not None and bool(self._api_key)

    async def retrieve_for_section(self, section_title: str, ao_context: str = "") -> str:
        if not self.is_ready:
            return ""

        doc_types = _SECTION_TYPE_MAP.get(section_title, [])
        if not doc_types:
            return ""

        try:
            query  = self._build_query(section_title, ao_context)
            vector = await self._embed(query)

            results = await self._client.search(  # type: ignore[union-attr]
                collection_name=_COLLECTION,
                query_vector=vector,
                query_filter=Filter(
                    should=[FieldCondition(key="doc_type", match=MatchAny(any=doc_types))]
                ),
                limit=_N_CANDIDATES,
                with_payload=True,
            )
            if not results:
                return ""

            top_k   = _SECTION_TOP_K.get(section_title, _RERANK_TOP_K)
            results = self._rerank(results, top_k)

            lines = [
                "---",
                "## CONTEXTE DOCUMENTAIRE (base de connaissances interne)",
                "",
            ]
            for r in results:
                payload  = r.payload or {}
                label    = DOCUMENT_TYPES.get(payload.get("doc_type", ""), "")
                doc_name = payload.get("doc_name", "")
                content  = payload.get("content", "")
                lines.append(f"**[{label}  {doc_name}]**")
                lines.append(content)
                lines.append("")

            return "\n".join(lines)

        except Exception as exc:
            logger.debug("RAG retrieval ignoré : %s", exc)
            return ""

    async def retrieve_for_ot_section(self, section: str, cps_scope: str) -> str:
        """RAG retrieval for offre technique sections (methodologie, moyens, planning, rse, references)."""
        if not self.is_ready:
            return ""
        doc_types = _OT_SECTION_TYPE_MAP.get(section, [])
        if not doc_types:
            return ""
        try:
            query  = self._build_query(section, cps_scope)
            vector = await self._embed(query)
            results = await self._client.search(  # type: ignore[union-attr]
                collection_name=_COLLECTION,
                query_vector=vector,
                query_filter=Filter(
                    should=[FieldCondition(key="doc_type", match=MatchAny(any=doc_types))]
                ),
                limit=_N_CANDIDATES,
                with_payload=True,
            )
            if not results:
                return ""
            results = self._rerank(results, _RERANK_TOP_K)
            lines = ["---", "## CONTEXTE DOCUMENTAIRE (base de connaissances interne)", ""]
            for r in results:
                payload  = r.payload or {}
                label    = DOCUMENT_TYPES.get(payload.get("doc_type", ""), "")
                doc_name = payload.get("doc_name", "")
                lines.append(f"**[{label}  {doc_name}]**")
                lines.append(payload.get("content", ""))
                lines.append("")
            return "\n".join(lines)
        except Exception as exc:
            logger.debug("RAG OT retrieval ignoré pour '%s' : %s", section, exc)
            return ""

    async def retrieve_for_chat(self, question: str) -> tuple[str, list[str]]:
        """
        Recherche non filtrée pour l'assistant conversationnel : contrairement à
        retrieve_for_section/retrieve_for_ot_section (filtrées par doc_type selon la
        section d'un document généré), une question de chat peut porter sur
        n'importe quel type de contenu indexé -- réglementation, guide plateforme,
        références de l'entreprise, etc. La similarité vectorielle seule décide de
        la pertinence, pas de filtre doc_type codé en dur.
        """
        if not self.is_ready or not question.strip():
            return "", []

        try:
            vector = await self._embed(question)
            results = await self._client.search(  # type: ignore[union-attr]
                collection_name=_COLLECTION,
                query_vector=vector,
                limit=_N_CANDIDATES,
                with_payload=True,
            )
            if not results:
                return "", []

            results = self._rerank(results, _RERANK_TOP_K)

            lines = ["---", "## CONTEXTE DOCUMENTAIRE (base de connaissances interne)", ""]
            sources: list[str] = []
            for r in results:
                payload  = r.payload or {}
                label    = DOCUMENT_TYPES.get(payload.get("doc_type", ""), "")
                doc_name = payload.get("doc_name", "")
                sources.append(f"{label}  {doc_name}" if label else doc_name)
                lines.append(f"**[{label}  {doc_name}]**")
                lines.append(payload.get("content", ""))
                lines.append("")

            return "\n".join(lines), sources

        except Exception as exc:
            logger.debug("RAG chat retrieval ignoré : %s", exc)
            return "", []

    async def _embed(self, text: str) -> list[float]:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                _MISTRAL_EMBED_URL,
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={"model": _EMBED_MODEL, "input": [text]},
            )
            resp.raise_for_status()
            return resp.json()["data"][0]["embedding"]

    def _build_query(self, section_title: str, ao_text: str) -> str:
        """Build embedding query with no LLM call  saves rate-limit budget."""
        return f"{section_title} {ao_text[:400]}"

    def _rerank(self, candidates: list, top_k: int) -> list:
        """Return top-k by Qdrant score  no LLM reranking."""
        return sorted(candidates, key=lambda r: r.score, reverse=True)[:top_k]

    async def get_collection_stats(self) -> dict:
        if self._client is None:
            return {"available": False, "vectors_count": 0}
        try:
            info = await self._client.get_collection(_COLLECTION)  # type: ignore[union-attr]
            return {"available": True, "vectors_count": info.vectors_count or 0}
        except Exception:
            return {"available": False, "vectors_count": 0}

    async def index_document(
        self,
        org_id: str,
        text: str,
        metadata: dict,
        doc_id: str,
        chunk_size: int = 1000,
    ) -> int:
        """Indexe un texte dans kb_{org_id} par chunks. Retourne le nombre de chunks indexés."""
        if not self.is_ready:
            return 0

        try:
            from qdrant_client.models import PointStruct, VectorParams, Distance
        except ImportError:
            return 0

        collection = f"offria_kb_{org_id}"

        # Créer la collection si elle n'existe pas
        try:
            await self._client.get_collection(collection)  # type: ignore[union-attr]
        except Exception:
            try:
                await self._client.create_collection(  # type: ignore[union-attr]
                    collection_name=collection,
                    vectors_config=VectorParams(size=1024, distance=Distance.COSINE),
                )
            except Exception as exc:
                logger.error("[rag] impossible de créer la collection %s: %s", collection, exc)
                return 0

        # Chunking simple par paragraphes
        paragraphs = [p.strip() for p in text.split("\n\n") if len(p.strip()) > 50]
        chunks: list[str] = []
        current = ""
        for p in paragraphs:
            if len(current) + len(p) < chunk_size:
                current = f"{current}\n\n{p}".strip()
            else:
                if current:
                    chunks.append(current)
                current = p
        if current:
            chunks.append(current)

        if not chunks:
            return 0

        points = []
        for i, chunk in enumerate(chunks):
            try:
                vector = await self._embed(chunk)
                payload = {**metadata, "content": chunk, "org_id": org_id, "doc_type": "note_metho"}
                points.append(PointStruct(
                    id=abs(hash(f"{doc_id}_{i}")) % (2**63),
                    vector=vector,
                    payload=payload,
                ))
            except Exception as exc:
                logger.warning("[rag] embed chunk %d échoué: %s", i, exc)

        if not points:
            return 0

        try:
            await self._client.upsert(collection_name=collection, points=points)  # type: ignore[union-attr]
            logger.info("[rag] %d chunks indexés dans %s (doc_id=%s)", len(points), collection, doc_id)
            return len(points)
        except Exception as exc:
            logger.error("[rag] upsert échoué collection=%s: %s", collection, exc)
            return 0
