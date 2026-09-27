"""
Embeddings interchangeables (2026-09-27, spec context/feature-spec/fournisseurs-ia/).

Meme principe que les providers de texte : une interface, une implementation
par fournisseur, un registre. Le choix se fait par le role `EMBEDDINGS` de
`.env` (voir `app/providers/router.py`).

Changer de modele d'embeddings rend les vecteurs deja indexes incomparables
aux nouveaux : il faut reindexer Qdrant. La taille (`dimensions`) est fixee
par le reglage `embeddings_dimensions` pour les modeles qui l'acceptent.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

import httpx


class AbstractEmbeddingProvider(ABC):
    def __init__(self, api_key: str, model_name: str, dimensions: int) -> None:
        self._api_key = api_key
        self._model_name = model_name or self.default_model
        self._dimensions = dimensions

    @property
    @abstractmethod
    def provider_name(self) -> str: ...

    @property
    @abstractmethod
    def default_model(self) -> str: ...

    @property
    def dimensions(self) -> int:
        return self._dimensions

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key)

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Un vecteur par texte, dans l'ordre. Leve une exception en cas d'echec."""


class MistralEmbeddingProvider(AbstractEmbeddingProvider):
    """mistral-embed : 1024 dimensions, fixes (le parametre n'est pas transmis)."""

    _URL = "https://api.mistral.ai/v1/embeddings"

    @property
    def provider_name(self) -> str:
        return "mistral"

    @property
    def default_model(self) -> str:
        return "mistral-embed"

    async def embed(self, texts: list[str]) -> list[list[float]]:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                self._URL,
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={"model": self._model_name, "input": texts},
            )
            resp.raise_for_status()
            return [d["embedding"] for d in resp.json()["data"]]


class OpenAIEmbeddingProvider(AbstractEmbeddingProvider):
    """text-embedding-3-small / -large : `dimensions` reduit la taille des
    vecteurs (1024 pour rester compatible avec les collections existantes)."""

    @property
    def provider_name(self) -> str:
        return "openai"

    @property
    def default_model(self) -> str:
        return "text-embedding-3-small"

    async def embed(self, texts: list[str]) -> list[list[float]]:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=self._api_key)
        resp = await client.embeddings.create(
            model=self._model_name, input=texts, dimensions=self._dimensions,
        )
        return [d.embedding for d in resp.data]


EMBEDDING_REGISTRY: dict[str, type[AbstractEmbeddingProvider]] = {
    "mistral": MistralEmbeddingProvider,
    "openai": OpenAIEmbeddingProvider,
}
