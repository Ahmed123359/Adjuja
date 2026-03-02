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
    "methodologies":  "Méthodologies et approches",
    "certifications": "Certifications et qualifications",
    "company":        "Présentation entreprise",
    "templates":      "Modèles de réponses AO",
}

_SECTION_TYPE_MAP: dict[str, list[str]] = {
    "Présentation de notre entreprise":       ["company", "certifications"],
    "Compréhension de vos besoins":           [],
    "Notre approche méthodologique":          ["methodologies", "templates"],
    "Moyens humains et techniques mobilisés": ["company", "certifications"],
    "Références similaires":                  ["references"],
    "Planning prévisionnel":                  ["methodologies", "templates"],
    "Proposition financière":                 ["templates"],
    "Conclusion et engagements":              ["company", "templates"],
}

_COLLECTION = "offria_kb"
_N_RESULTS  = 3


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
            query = f"{section_title} {ao_context[:300]}"

            # Embedding de la requête via OpenAI
            response = await self._openai.embeddings.create(  # type: ignore[union-attr]
                model="text-embedding-3-small",
                input=query,
            )
            vector = response.data[0].embedding

            # Filtre optionnel par type de document (boost sémantique)
            doc_types = _SECTION_TYPE_MAP.get(section_title, [])
            query_filter = None
            if doc_types:
                query_filter = Filter(
                    should=[
                        FieldCondition(key="doc_type", match=MatchAny(any=doc_types))
                    ]
                )

            # Requête Qdrant
            results = await self._client.search(  # type: ignore[union-attr]
                collection_name=_COLLECTION,
                query_vector=vector,
                query_filter=query_filter,
                limit=_N_RESULTS,
                with_payload=True,
            )

            if not results:
                return ""

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
