"""
Modele de texte interchangeable pour l'analyse de la veille (2026-09-27).
Spec : context/feature-spec/fournisseurs-ia/ (meme principe que le backend).

Le code demande « le modele d'analyse », jamais un fournisseur. Le role se
configure dans .env : `LLM_ANALYSIS=deepseek:deepseek-chat`.

Les fournisseurs retenus exposent tous l'API Chat Completions d'OpenAI : une
seule implementation HTTP suffit, parametree par fournisseur (adresse, cle).
Un fournisseur au format different s'ajoute par une autre sous-classe de
`ChatProvider` enregistree dans `_FOURNISSEURS`.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

import httpx

from app.core.config import settings


class ChatProvider(ABC):
    @abstractmethod
    async def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        json_mode: bool = False,
        max_tokens: int = 8000,
        temperature: float = 0.1,
    ) -> str:
        """Reponse du modele. Leve une exception en cas d'echec."""


@dataclass(frozen=True)
class _Fournisseur:
    base_url_setting: str
    api_key_setting: str
    modele_defaut: str


_FOURNISSEURS: dict[str, _Fournisseur] = {
    "mistral": _Fournisseur("mistral_base_url", "mistral_api_key", "mistral-large-latest"),
    "deepseek": _Fournisseur("deepseek_base_url", "deepseek_api_key", "deepseek-chat"),
    "openai": _Fournisseur("openai_base_url", "openai_api_key", "gpt-4.1-mini"),
}


class OpenAICompatibleChat(ChatProvider):
    """Chat Completions au format OpenAI (Mistral, DeepSeek, OpenAI)."""

    def __init__(self, base_url: str, api_key: str, model: str, timeout_s: float = 240) -> None:
        self._url = base_url.rstrip("/") + "/chat/completions"
        self._api_key = api_key
        self._model = model
        self._timeout = timeout_s

    async def complete(self, system_prompt, user_prompt, *, json_mode=False, max_tokens=8000, temperature=0.1) -> str:
        corps = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        # Modeles de raisonnement OpenAI (serie o, gpt-5) : pas de temperature,
        # `max_completion_tokens` au lieu de `max_tokens`.
        if self._model.lower().startswith(("o1", "o3", "o4", "gpt-5")):
            corps["max_completion_tokens"] = max_tokens
        else:
            corps["max_tokens"] = max_tokens
            corps["temperature"] = temperature
        if json_mode:
            corps["response_format"] = {"type": "json_object"}
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                self._url, json=corps, headers={"Authorization": f"Bearer {self._api_key}"},
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"] or ""


def parse_role(value: str) -> tuple[str, str]:
    vendor, _, model = (value or "").strip().partition(":")
    return vendor.strip().lower(), model.strip()


def get_chat() -> ChatProvider:
    """Modele du role d'analyse (`LLM_ANALYSIS`)."""
    vendor, model = parse_role(settings.llm_analysis)
    f = _FOURNISSEURS.get(vendor)
    if f is None:
        raise ValueError(f"Fournisseur IA inconnu : {vendor!r}. Connus : {', '.join(_FOURNISSEURS)}.")
    return OpenAICompatibleChat(
        base_url=getattr(settings, f.base_url_setting),
        api_key=getattr(settings, f.api_key_setting) or "",
        model=model or f.modele_defaut,
    )
