"""
Routeur de roles IA (2026-09-27, spec context/feature-spec/fournisseurs-ia/).

Le code demande un ROLE (« le modele d'analyse », « les embeddings »), jamais
un fournisseur. Chaque role se configure en une ligne `fournisseur:modele`
dans `.env` :

    LLM_ANALYSIS=deepseek:deepseek-chat
    LLM_FAST=deepseek:deepseek-chat
    EMBEDDINGS=openai:text-embedding-3-small
    VISION=openai:gpt-4.1-mini

Ajouter un fournisseur : une classe dans le registre de la capacite
(`ProviderFactory._registry`, `EMBEDDING_REGISTRY`, `VISION_REGISTRY`) et sa
cle dans `_API_KEYS`. Rien d'autre a toucher.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.config.settings import Settings, get_settings
from app.providers.base import AbstractLLMProvider
from app.providers.embeddings import EMBEDDING_REGISTRY, AbstractEmbeddingProvider
from app.providers.provider_factory import ProviderFactory
from app.providers.vision import VISION_REGISTRY, AbstractVisionProvider

ChatRole = Literal["analysis", "fast"]

_API_KEYS = {
    "openai": "openai_api_key",
    "anthropic": "anthropic_api_key",
    "mistral": "mistral_api_key",
    "deepseek": "deepseek_api_key",
}


@dataclass(frozen=True)
class RoleSpec:
    vendor: str
    model: str


def parse_role(value: str) -> RoleSpec:
    """`fournisseur:modele` -> RoleSpec. Le modele peut etre omis
    (`deepseek`) : le fournisseur prend alors son modele par defaut."""
    vendor, _, model = (value or "").strip().partition(":")
    vendor = vendor.strip().lower()
    if not vendor:
        raise ValueError(f"Role IA mal configure : {value!r} (attendu « fournisseur:modele »).")
    return RoleSpec(vendor=vendor, model=model.strip())


def api_key_for(vendor: str, settings: Settings | None = None) -> str:
    s = settings or get_settings()
    attr = _API_KEYS.get(vendor)
    if attr is None:
        raise ValueError(f"Fournisseur IA inconnu : {vendor!r}. Connus : {', '.join(_API_KEYS)}.")
    return getattr(s, attr, "") or ""


def get_chat(role: ChatRole = "analysis", settings: Settings | None = None) -> AbstractLLMProvider:
    s = settings or get_settings()
    spec = parse_role(s.llm_analysis if role == "analysis" else s.llm_fast)
    return ProviderFactory.create(spec.vendor, api_key_for(spec.vendor, s), spec.model)


def get_embeddings(settings: Settings | None = None) -> AbstractEmbeddingProvider:
    s = settings or get_settings()
    spec = parse_role(s.embeddings)
    cls = EMBEDDING_REGISTRY.get(spec.vendor)
    if cls is None:
        raise ValueError(f"Aucun fournisseur d'embeddings {spec.vendor!r}. Connus : {', '.join(EMBEDDING_REGISTRY)}.")
    return cls(api_key_for(spec.vendor, s), spec.model, s.embeddings_dimensions)


def get_vision(settings: Settings | None = None) -> AbstractVisionProvider:
    s = settings or get_settings()
    spec = parse_role(s.vision)
    cls = VISION_REGISTRY.get(spec.vendor)
    if cls is None:
        raise ValueError(f"Aucun fournisseur de vision {spec.vendor!r}. Connus : {', '.join(VISION_REGISTRY)}.")
    return cls(api_key_for(spec.vendor, s), spec.model)
