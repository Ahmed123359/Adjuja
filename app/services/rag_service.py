"""
Service RAG côté application principale — lecture seule.

Ce service ne fait QU'interroger Qdrant. L'indexation est entièrement
déléguée au microservice rag-etl (rag_service/).

Utilisé par GenerationService pour enrichir chaque section avec des extraits
de la base de connaissances interne pendant la génération.

Si Qdrant est indisponible ou la collection vide, retrieve_for_section()
retourne silencieusement une chaîne vide (dégradation gracieuse).
"""
from __future__ import annotations

import json
import logging

logger = logging.getLogger(__name__)

# Imports optionnels — dégradation gracieuse si non installé
try:
    from qdrant_client import AsyncQdrantClient
    from qdrant_client.models import FieldCondition, Filter, MatchAny
    _QDRANT_OK = True
except ImportError:
    _QDRANT_OK = False
    logger.warning("qdrant-client non installé → RAG désactivé. pip install qdrant-client")

try:
    from openai import AsyncOpenAI
    _OPENAI_OK = True
except ImportError:
    _OPENAI_OK = False


# ── Constantes ────────────────────────────────────────────────────────────

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

_COLLECTION      = "offria_kb"
_N_CANDIDATES    = 20  # candidats Qdrant avant reranking
_RERANK_TOP_K    = 3   # top-K par défaut (sections courtes)
_RERANK_MODEL    = "gpt-4o-mini"

# Top-K final par section — sections riches en contenu méritent plus de chunks
_SECTION_TOP_K: dict[str, int] = {
    "Notre approche méthodologique":          5,  # phases, démarche, outils
    "Moyens humains et techniques mobilisés": 5,  # équipe + équipements
    "Références similaires":                  5,  # plus de références = mieux
    "Planning prévisionnel":                  4,  # phases + jalons
}

_CHEAP_MODEL      = "gpt-4o-mini"   # modèle utilisé pour query gen + reranking
_RERANK_MODEL     = _CHEAP_MODEL    # alias explicite pour la lisibilité

_QUERY_GEN_MAX_TOKENS = 60          # ~15-20 mots max pour la query

_QUERY_GEN_SYSTEM = (
    "Tu es un assistant de recherche documentaire. "
    "À partir d'un appel d'offres et d'un nom de section, génère une requête de recherche "
    "courte (10-20 mots, mots-clés uniquement) pour retrouver dans une base documentaire "
    "les extraits les plus pertinents pour rédiger cette section. "
    "Retourne UNIQUEMENT la requête, sans ponctuation finale ni explication."
)

_QUERY_GEN_USER = """\
Section à rédiger : {section_title}

Appel d'offres :
{ao_text}

Génère une requête de recherche documentaire de 10 à 20 mots, en français, \
ciblée sur ce que cette section doit démontrer pour CET appel d'offres."""

_RERANK_SYSTEM = (
    "You are a relevance scoring assistant. "
    "Given a query and a list of text chunks, identify the most relevant ones. "
    "Return ONLY a JSON array of integers (chunk indices), nothing else."
)

_RERANK_USER = """\
Query: {query}

Chunks:
{chunks_text}

Return a JSON array of the {top_k} most relevant chunk indices (0-based), \
sorted by relevance (most relevant first).
Example: [5, 2, 11]
Return ONLY the JSON array."""


class RagService:
    """
    Service RAG (lecture seule) pour la génération augmentée.

    Se connecte à Qdrant via AsyncQdrantClient.
    Utilise OpenAI text-embedding-3-small pour générer le vecteur requête.

    Toutes les erreurs sont absorbées — le service se dégrade gracieusement
    si Qdrant est down ou la collection vide.
    """

    def __init__(self, qdrant_url: str, openai_api_key: str) -> None:
        self._client: object | None = None
        self._openai: object | None = None

        if not _QDRANT_OK or not _OPENAI_OK:
            return

        if not qdrant_url or not openai_api_key:
            logger.info("RAG non configuré (QDRANT_URL ou OPENAI_API_KEY manquant)")
            return

        try:
            self._client = AsyncQdrantClient(url=qdrant_url)
            self._openai = AsyncOpenAI(api_key=openai_api_key)
            logger.info("RAG client initialisé — Qdrant: %s", qdrant_url)
        except Exception as exc:
            logger.warning("Impossible d'initialiser le client RAG : %s", exc)

    # ── Interface publique ────────────────────────────────────────────────

    @property
    def is_ready(self) -> bool:
        """True si les clients Qdrant et OpenAI sont initialisés."""
        return self._client is not None and self._openai is not None

    async def retrieve_for_section(
        self,
        section_title: str,
        ao_context: str = "",
    ) -> str:
        """
        Récupère les extraits documentaires les plus pertinents pour une section.

        Génère un embedding de la requête via OpenAI, interroge Qdrant,
        formate les résultats en bloc Markdown prêt à injecter dans le prompt.

        Args:
            section_title: Titre de la section (ex: "Références similaires").
            ao_context:    Extrait du titre/description de l'AO.

        Returns:
            Bloc Markdown formaté, ou "" si le RAG n'est pas disponible.
        """
        if not self.is_ready:
            return ""

        try:
            query = await self._build_query_for_section(section_title, ao_context)

            # Embedding de la requête via OpenAI
            response = await self._openai.embeddings.create(  # type: ignore[union-attr]
                model="text-embedding-3-small",
                input=query,
            )
            vector = response.data[0].embedding

            # Filtre par type de document selon la section
            # [] = RAG explicitement désactivé pour cette section
            doc_types = _SECTION_TYPE_MAP.get(section_title, [])
            if not doc_types:
                return ""

            query_filter = Filter(
                should=[
                    FieldCondition(key="doc_type", match=MatchAny(any=doc_types))
                ]
            )

            # Requête Qdrant — filet large avant reranking
            results = await self._client.search(  # type: ignore[union-attr]
                collection_name=_COLLECTION,
                query_vector=vector,
                query_filter=query_filter,
                limit=_N_CANDIDATES,
                with_payload=True,
            )

            if not results:
                return ""

            # Reranking — LLM cheap sélectionne les chunks vraiment pertinents
            top_k = _SECTION_TOP_K.get(section_title, _RERANK_TOP_K)
            results = await self._rerank(query, results, top_k)

            lines = [
                "---",
                "## CONTEXTE DOCUMENTAIRE (base de connaissances interne)",
                "Extraits pertinents issus des documents internes de l'entreprise :",
                "",
            ]
            for r in results:
                payload  = r.payload or {}
                doc_type = payload.get("doc_type", "")
                doc_name = payload.get("doc_name", "")
                content  = payload.get("content", "")
                label    = DOCUMENT_TYPES.get(doc_type, doc_type)
                lines.append(f"**[{label} — {doc_name}]**")
                lines.append(content)
                lines.append("")

            return "\n".join(lines)

        except Exception as exc:
            logger.debug("RAG retrieval ignoré (Qdrant indisponible ou collection vide) : %s", exc)
            return ""

    async def _rerank(self, query: str, candidates: list, top_k: int = _RERANK_TOP_K) -> list:
        """
        Re-classe les candidats Qdrant via un LLM cheap et retourne les top-K pertinents.

        Envoie la requête + les extraits au modèle, qui retourne un tableau JSON
        d'indices triés par pertinence. Fallback silencieux sur les top-K Qdrant
        en cas d'erreur (JSON invalide, timeout, etc.).
        """
        if len(candidates) <= top_k:
            return candidates

        try:
            chunks_text = "\n".join(
                f"[{i}] {r.payload.get('content', '')[:400]}"
                for i, r in enumerate(candidates)
            )
            user_prompt = _RERANK_USER.format(
                query=query,
                chunks_text=chunks_text,
                top_k=top_k,
            )
            response = await self._openai.chat.completions.create(  # type: ignore[union-attr]
                model=_CHEAP_MODEL,
                messages=[
                    {"role": "system", "content": _RERANK_SYSTEM},
                    {"role": "user",   "content": user_prompt},
                ],
                max_tokens=50,
                temperature=0,
            )
            raw = response.choices[0].message.content.strip()
            indices: list[int] = json.loads(raw)

            # Valider que les indices sont dans les bornes
            valid = [i for i in indices if isinstance(i, int) and 0 <= i < len(candidates)]
            if not valid:
                return candidates[:top_k]

            reranked = [candidates[i] for i in valid[:top_k]]

            # Compléter jusqu'à top_k si le LLM en a retourné moins
            if len(reranked) < top_k:
                seen = set(valid[:top_k])
                for i, c in enumerate(candidates):
                    if i not in seen:
                        reranked.append(c)
                    if len(reranked) >= top_k:
                        break

            logger.debug("Reranker : %d candidats → top-%d (indices=%s)", len(candidates), top_k, valid[:top_k])
            return reranked

        except Exception as exc:
            logger.debug("Reranker ignoré, fallback top-%d Qdrant : %s", top_k, exc)
            return candidates[:top_k]

    async def _build_query_for_section(
        self,
        section_title: str,
        ao_text: str,
    ) -> str:
        """
        Génère une requête de recherche Qdrant ciblée via LLM.

        Lit le texte AO complet et produit une requête dense en mots-clés
        spécifiques au domaine et à la section — bien meilleure que du texte
        brut tronqué pour l'embedding vectoriel.

        Fallback silencieux sur "{section_title} {ao_text[:300]}" si le LLM échoue.
        """
        try:
            user = _QUERY_GEN_USER.format(
                section_title=section_title,
                ao_text=ao_text,
            )
            response = await self._openai.chat.completions.create(  # type: ignore[union-attr]
                model=_CHEAP_MODEL,
                messages=[
                    {"role": "system", "content": _QUERY_GEN_SYSTEM},
                    {"role": "user",   "content": user},
                ],
                max_tokens=_QUERY_GEN_MAX_TOKENS,
                temperature=0,
            )
            query = response.choices[0].message.content.strip()
            logger.debug("Query RAG générée pour « %s » : %s", section_title, query)
            return query
        except Exception as exc:
            logger.debug("Query LLM échouée, fallback basique : %s", exc)
            return f"{section_title} {ao_text[:300]}"

    async def get_collection_stats(self) -> dict:
        """Retourne les stats Qdrant pour l'endpoint /api/v1/rag/status."""
        if self._client is None:
            return {"available": False, "vectors_count": 0}
        try:
            info = await self._client.get_collection(_COLLECTION)  # type: ignore[union-attr]
            return {
                "available":     True,
                "vectors_count": info.vectors_count or 0,
            }
        except Exception:
            return {"available": False, "vectors_count": 0}
