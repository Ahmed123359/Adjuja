"""
Service de chat RAG  répond aux questions de l'utilisateur en s'appuyant
sur la base de connaissances Qdrant.

Flux par appel :
  1. Recherche RAG sur la dernière question utilisateur
  2. Construction du system prompt avec le contexte documentaire
  3. Formatage de l'historique de conversation dans le user prompt
  4. Appel LLM via generate_text() du provider sélectionné
  5. Retour de la réponse + sources identifiées
"""
from __future__ import annotations

import logging

from app.config.settings import Settings
from app.models.chat import ChatMessage, ChatResponse
from app.models.generation import ProviderEnum
from app.providers.provider_factory import ProviderFactory
from app.services.rag_service import RagService

logger = logging.getLogger(__name__)

# ── Prompts ───────────────────────────────────────────────────────────────────

_SYSTEM_BASE = """\
Tu es un assistant expert en appels d'offres marocains, spécialisé dans la rédaction \
de réponses commerciales et techniques. Tu aides les équipes à préparer leurs dossiers \
de soumission.

Réponds en français, de manière concise et professionnelle. \
Appuie-toi sur le contexte documentaire fourni quand il est pertinent. \
Si tu ne sais pas, dis-le clairement plutôt que d'inventer."""

_SYSTEM_WITH_RAG = """\
{base}

---
## CONTEXTE DOCUMENTAIRE
Extraits issus de la base de connaissances interne :

{rag_context}
---"""

_MAX_HISTORY_MESSAGES = 10   # on tronque l'historique si trop long
_MAX_TOKENS_CHAT      = 2048
_TEMPERATURE_CHAT     = 0.5


class ChatService:
    """
    Orchestre un tour de conversation :
      - récupère le contexte RAG pertinent
      - appelle le LLM avec l'historique formaté
      - retourne la réponse et les sources utilisées

    Args:
        settings:    Configuration applicative (clés API, etc.)
        rag_service: Service RAG en lecture seule (Qdrant)
    """

    def __init__(self, settings: Settings, rag_service: RagService) -> None:
        self._settings    = settings
        self._rag_service = rag_service

    async def chat(
        self,
        messages:  list[ChatMessage],
        provider:  ProviderEnum,
        model:     str,
    ) -> ChatResponse:
        """
        Génère une réponse au dernier message utilisateur de la conversation.

        Input:
            messages: Historique complet [{"role": "user"|"assistant", "content": "..."}]
            provider: Provider LLM à utiliser (openai / anthropic / mistral)
            model:    Identifiant du modèle (vide = défaut du provider)

        Output:
            ChatResponse avec answer, sources, tokens_used, provider_utilise, model_utilise
        """
        # ── 1. Extraire la dernière question utilisateur ──────────────────
        last_user_msg = next(
            (m.content for m in reversed(messages) if m.role == "user"),
            "",
        )

        # ── 2. Recherche RAG sur la question actuelle ─────────────────────
        rag_context, sources = await self._retrieve_rag(last_user_msg)

        # ── 3. Construire le system prompt ────────────────────────────────
        if rag_context:
            system_prompt = _SYSTEM_WITH_RAG.format(
                base=_SYSTEM_BASE,
                rag_context=rag_context,
            )
        else:
            system_prompt = _SYSTEM_BASE

        # ── 4. Formater l'historique en user_prompt ───────────────────────
        # On tronque l'historique pour éviter de dépasser le contexte du LLM
        recent = messages[-_MAX_HISTORY_MESSAGES:]
        history_text = self._format_history(recent)

        # ── 5. Instancier le provider et appeler generate_text ────────────
        api_key = self._get_api_key(provider)
        llm     = ProviderFactory.create(
            provider_name=provider.value,
            api_key=api_key,
            model_name=model,
        )

        logger.info(
            "Chat  provider=%s model=%s rag_sources=%d",
            provider.value, llm.current_model, len(sources),
        )

        answer, tokens = await llm.generate_text(
            system_prompt=system_prompt,
            user_prompt=history_text,
            max_tokens=_MAX_TOKENS_CHAT,
            temperature=_TEMPERATURE_CHAT,
        )

        return ChatResponse(
            answer=answer,
            sources=sources,
            tokens_used=tokens,
            provider_utilise=llm.provider_name,
            model_utilise=llm.current_model,
        )

    # ── Méthodes privées ──────────────────────────────────────────────────────

    async def _retrieve_rag(self, question: str) -> tuple[str, list[str]]:
        """
        Interroge Qdrant avec la question et retourne (contexte_texte, titres_sources).

        Input:  question  dernière question de l'utilisateur
        Output: (bloc_markdown_rag, liste_de_titres_sources)
                Si RAG indisponible → ("", [])
        """
        return await self._rag_service.retrieve_for_chat(question)

    def _format_history(self, messages: list[ChatMessage]) -> str:
        """
        Formate l'historique de conversation en texte structuré pour le user_prompt.

        Input:  liste de ChatMessage (alternance user/assistant)
        Output: string formaté "[Utilisateur]: ...\n[Assistant]: ...\n..."
        """
        lines: list[str] = []
        for msg in messages:
            label = "Utilisateur" if msg.role == "user" else "Assistant"
            lines.append(f"[{label}]: {msg.content}")
        return "\n\n".join(lines)

    def _get_api_key(self, provider: ProviderEnum) -> str:
        """
        Retourne la clé API correspondant au provider.

        Input:  provider  enum du provider LLM
        Output: clé API (str)
        Raises: ValueError si la clé n'est pas configurée
        """
        keys = {
            ProviderEnum.OPENAI:    self._settings.openai_api_key,
            ProviderEnum.ANTHROPIC: self._settings.anthropic_api_key,
            ProviderEnum.MISTRAL:   self._settings.mistral_api_key,
        }
        key = keys.get(provider, "")
        if not key:
            raise ValueError(f"Clé API manquante pour le provider '{provider.value}'.")
        return key