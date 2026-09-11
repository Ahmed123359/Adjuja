from __future__ import annotations
from datetime import datetime
from uuid import uuid4
from pydantic import BaseModel, Field
from app.models.generation import GenerationResult


class HistoryEntry(BaseModel):
    """Entrée complète de l'historique (avec résultat complet)."""

    id:              str = Field(default_factory=lambda: str(uuid4()))
    created_at:      str = Field(default_factory=lambda: datetime.now().isoformat())
    user_id:         str = ""   # Identifiant de l'utilisateur propriétaire
    ao_excerpt:      str   # Premiers 150 caractères du texte AO
    company_nom:     str
    provider:        str
    model:           str
    tokens_utilises: int
    langue:          str = "fr"
    result:          GenerationResult


class HistorySummary(BaseModel):
    """Version allégée pour l'endpoint liste (sans le résultat complet)."""

    id:              str
    created_at:      str
    user_id:         str = ""
    ao_excerpt:      str
    company_nom:     str
    provider:        str
    model:           str
    tokens_utilises: int
    langue:          str = "fr"

    @classmethod
    def from_entry(cls, entry: HistoryEntry) -> "HistorySummary":
        return cls(
            id=entry.id,
            created_at=entry.created_at,
            user_id=entry.user_id,
            ao_excerpt=entry.ao_excerpt,
            company_nom=entry.company_nom,
            provider=entry.provider,
            model=entry.model,
            tokens_utilises=entry.tokens_utilises,
            langue=entry.langue,
        )
