import re
from fastapi import HTTPException, status

_MAX_AO_CHARS   = 200_000
_MAX_CHAT_CHARS = 10_000
_MAX_FILE_MB    = 20

_INJECTION_PATTERNS = re.compile(
    r"(ignore\s+(previous|above|all)\s+instructions?"
    r"|repeat\s+(your\s+)?(system\s+)?prompt"
    r"|you\s+are\s+now\s+(a\s+)?(DAN|jailbreak|unrestricted)"
    r"|act\s+as\s+(if\s+you\s+are\s+)?(DAN|GPT|an?\s+AI\s+without)"
    r"|disregard\s+(your\s+)?(previous\s+)?instructions?"
    r"|<\s*system\s*>|<\s*SYSTEM\s*>"
    r"|\[INST\]|\[/INST\]"
    r"|###\s*System\s*:)",
    re.IGNORECASE,
)


def sanitize_ao_text(text: str) -> str:
    """Valide et encapsule le texte AO avant injection dans un prompt."""
    if len(text) > _MAX_AO_CHARS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Le texte AO dépasse la limite de {_MAX_AO_CHARS:,} caractères.",
        )
    if _INJECTION_PATTERNS.search(text):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Le contenu soumis contient des patterns non autorisés.",
        )
    return f"<user_content>\n{text}\n</user_content>"


def sanitize_chat_message(text: str) -> str:
    """Valide et encapsule un message de chat utilisateur."""
    if len(text) > _MAX_CHAT_CHARS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Le message dépasse la limite de {_MAX_CHAT_CHARS:,} caractères.",
        )
    if _INJECTION_PATTERNS.search(text):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Le message contient des patterns non autorisés.",
        )
    return f"<user_content>\n{text}\n</user_content>"


def validate_upload_size(file_bytes: bytes, field_name: str = "fichier") -> None:
    """Rejette les fichiers qui dépassent la limite de taille."""
    limit = _MAX_FILE_MB * 1024 * 1024
    if len(file_bytes) > limit:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Le {field_name} dépasse la limite de {_MAX_FILE_MB} Mo.",
        )
