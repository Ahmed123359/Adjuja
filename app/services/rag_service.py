from __future__ import annotations

import json
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
_MISTRAL_CHAT_URL  = "https://api.mistral.ai/v1/chat/completions"
_EMBED_MODEL       = "mistral-embed"
_CHEAP_MODEL       = "mistral-small-latest"

DOCUMENT_TYPES: dict[str, str] = {
    "references":     "Références et réalisations",
    "templates":      "Modèles de réponses AO",
    "certifications": "Certifications et qualifications",
    "company":        "Présentation entreprise",
    "resources":      "Moyens humains et matériels",
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
            logger.info("RAG initialisé — Qdrant: %s, embed: %s", qdrant_url, _EMBED_MODEL)
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
            query  = await self._build_query(section_title, ao_context)
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
            results = await self._rerank(query, results, top_k)

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
                lines.append(f"**[{label} — {doc_name}]**")
                lines.append(content)
                lines.append("")

            return "\n".join(lines)

        except Exception as exc:
            logger.debug("RAG retrieval ignoré : %s", exc)
            return ""

    async def _embed(self, text: str) -> list[float]:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                _MISTRAL_EMBED_URL,
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={"model": _EMBED_MODEL, "input": [text]},
            )
            resp.raise_for_status()
            return resp.json()["data"][0]["embedding"]

    async def _mistral_chat(self, system: str, user: str, max_tokens: int = 100) -> str:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                _MISTRAL_CHAT_URL,
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={
                    "model":      _CHEAP_MODEL,
                    "messages":   [{"role": "system", "content": system}, {"role": "user", "content": user}],
                    "max_tokens": max_tokens,
                    "temperature": 0,
                },
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"].strip()

    async def _build_query(self, section_title: str, ao_text: str) -> str:
        try:
            return await self._mistral_chat(
                _QUERY_GEN_SYSTEM,
                f"Section : {section_title}\n\nAppel d'offres :\n{ao_text}",
                max_tokens=60,
            )
        except Exception as exc:
            logger.debug("Query gen échoué, fallback : %s", exc)
            return f"{section_title} {ao_text[:300]}"

    async def _rerank(self, query: str, candidates: list, top_k: int) -> list:
        if len(candidates) <= top_k:
            return candidates
        try:
            chunks_text = "\n".join(
                f"[{i}] {r.payload.get('content', '')[:400]}"
                for i, r in enumerate(candidates)
            )
            raw = await self._mistral_chat(
                _RERANK_SYSTEM,
                f"Query: {query}\n\nChunks:\n{chunks_text}\n\nReturn a JSON array of the {top_k} most relevant chunk indices (0-based).",
                max_tokens=50,
            )
            indices = [i for i in json.loads(raw) if isinstance(i, int) and 0 <= i < len(candidates)]
            return [candidates[i] for i in indices[:top_k]] if indices else candidates[:top_k]
        except Exception as exc:
            logger.debug("Reranker ignoré : %s", exc)
            return candidates[:top_k]

    async def get_collection_stats(self) -> dict:
        if self._client is None:
            return {"available": False, "vectors_count": 0}
        try:
            info = await self._client.get_collection(_COLLECTION)  # type: ignore[union-attr]
            return {"available": True, "vectors_count": info.vectors_count or 0}
        except Exception:
            return {"available": False, "vectors_count": 0}
