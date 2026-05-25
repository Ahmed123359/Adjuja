"""
Valide chaque document avant indexation dans Qdrant.
Couvre LLM03 (RAG poisoning).
"""
import re

_MAX_CHUNK_CHARS = 2_000
_MAX_DOC_CHARS   = 500_000

_INJECTION_PATTERNS = re.compile(
    r"(ignore\s+(previous|above|all)\s+instructions?"
    r"|<\s*system\s*>"
    r"|###\s*System\s*:"
    r"|\[INST\]"
    r"|you\s+are\s+now\s+a)"
    r"|(OVERRIDE|BYPASS|JAILBREAK)",
    re.IGNORECASE,
)


class IngestionError(ValueError):
    pass


def validate_document(content: str, source: str) -> None:
    """
    Vérifie qu'un document est sûr à indexer.
    Lève IngestionError si le contenu est suspect ou trop volumineux.
    """
    if len(content) > _MAX_DOC_CHARS:
        raise IngestionError(
            f"Document '{source}' trop volumineux ({len(content):,} chars, max {_MAX_DOC_CHARS:,})."
        )
    if _INJECTION_PATTERNS.search(content):
        raise IngestionError(
            f"Document '{source}' contient des patterns d'injection suspects  indexation refusée."
        )


def validate_chunk(chunk: str, source: str, chunk_idx: int) -> str:
    """
    Valide et tronque un chunk si nécessaire.
    Retourne le chunk nettoyé.
    """
    if _INJECTION_PATTERNS.search(chunk):
        raise IngestionError(
            f"Chunk {chunk_idx} de '{source}' contient un pattern d'injection  ignoré."
        )
    return chunk[:_MAX_CHUNK_CHARS]
