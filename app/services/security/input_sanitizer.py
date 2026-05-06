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


_MAX_INSTRUCTIONS_CHARS = 1_500
_LOGO_MAGIC = (b"\x89PNG", b"\xff\xd8\xff")


def sanitize_custom_instructions(text: str) -> str:
    """Valide les instructions personnalisées utilisateur avant injection dans le prompt."""
    if len(text) > _MAX_INSTRUCTIONS_CHARS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Les instructions dépassent {_MAX_INSTRUCTIONS_CHARS} caractères.",
        )
    if _INJECTION_PATTERNS.search(text):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Les instructions contiennent des patterns non autorisés.",
        )
    return text.strip()


def validate_logo(data: bytes, filename: str) -> None:
    """Valide qu'un fichier logo est bien une image PNG ou JPEG légitime."""
    from pathlib import Path as _Path
    ext = _Path(filename).suffix.lower()
    if ext not in {".png", ".jpg", ".jpeg"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Logo : PNG ou JPG uniquement.")
    if len(data) > 2 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Logo : 2 Mo maximum.")
    if not any(data.startswith(m) for m in _LOGO_MAGIC):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Fichier logo invalide.")


def validate_upload_size(file_bytes: bytes, field_name: str = "fichier") -> None:
    """Rejette les fichiers qui dépassent la limite de taille."""
    limit = _MAX_FILE_MB * 1024 * 1024
    if len(file_bytes) > limit:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Le {field_name} dépasse la limite de {_MAX_FILE_MB} Mo.",
        )
