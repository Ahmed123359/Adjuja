"""
Modèles Pydantic pour l'endpoint de chat RAG (/api/v1/chat).
"""
from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field
from app.models.generation import ProviderEnum


class ChatMessage(BaseModel):
    """Un message dans la conversation (rôle + contenu)."""
    role:    Literal["user", "assistant"]
    content: str = Field(min_length=1)


class ChatRequest(BaseModel):
    """Corps de la requête POST /chat."""
    messages: list[ChatMessage] = Field(
        min_length=1,
        description="Historique complet de la conversation (dernier message = question actuelle)",
    )
    provider: ProviderEnum = Field(
        default=ProviderEnum.ANTHROPIC,
        description="Provider LLM à utiliser",
    )
    model: str = Field(
        default="",
        description="Modèle spécifique (vide = défaut du provider)",
    )


class ChatResponse(BaseModel):
    """Réponse retournée par POST /chat."""
    answer:           str       = Field(description="Réponse générée par le LLM")
    sources:          list[str] = Field(default_factory=list, description="Titres des documents RAG utilisés")
    tokens_used:      int       = Field(description="Tokens consommés pour cette réponse")
    provider_utilise: str       = Field(description="Provider effectivement utilisé")
    model_utilise:    str       = Field(description="Modèle effectivement utilisé")