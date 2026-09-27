"""
Vision interchangeable (2026-09-27, spec context/feature-spec/fournisseurs-ia/).

Lecture d'images de pages (formulaires a remplir) par un modele multimodal.
Choix par le role `VISION` de `.env`. Decision utilisateur du 2026-09-27 :
OpenAI `gpt-4.1-mini` remplacera Pixtral ; l'implementation Mistral reste
disponible derriere la meme interface.

Utilise par le remplissage (`app/services/filler/filler_llm.py`) en dernier
palier, quand la lecture Tesseract d'un scan n'est pas assez fiable.
"""

from __future__ import annotations

import base64
from abc import ABC, abstractmethod


def _data_url(img: bytes, mime: str = "image/png") -> str:
    return f"data:{mime};base64," + base64.b64encode(img).decode("ascii")


class AbstractVisionProvider(ABC):
    def __init__(self, api_key: str, model_name: str = "") -> None:
        self._api_key = api_key
        self._model_name = model_name or self.default_model

    @property
    @abstractmethod
    def provider_name(self) -> str: ...

    @property
    @abstractmethod
    def default_model(self) -> str: ...

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key)

    @abstractmethod
    async def read(
        self,
        images: list[bytes],
        prompt: str,
        *,
        system: str | None = None,
        json_mode: bool = False,
        max_tokens: int = 4000,
        temperature: float = 0,
        mime: str = "image/png",
    ) -> str:
        """Texte (ou JSON) produit par le modele a partir des images (dans
        l'ordre des pages) et de la consigne. Leve une exception en cas d'echec."""


class OpenAIVisionProvider(AbstractVisionProvider):
    @property
    def provider_name(self) -> str:
        return "openai"

    @property
    def default_model(self) -> str:
        return "gpt-4.1-mini"

    async def read(self, images, prompt, *, system=None, json_mode=False, max_tokens=4000,
                   temperature=0, mime="image/png") -> str:
        from openai import AsyncOpenAI

        contenu = []
        for i, img in enumerate(images, 1):
            contenu.append({"type": "text", "text": f"Page {i} :"})
            contenu.append({"type": "image_url", "image_url": {"url": _data_url(img, mime)}})
        contenu.append({"type": "text", "text": prompt})
        messages = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": contenu}]
        extra = {"response_format": {"type": "json_object"}} if json_mode else {}
        resp = await AsyncOpenAI(api_key=self._api_key).chat.completions.create(
            model=self._model_name,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=messages,
            **extra,
        )
        return resp.choices[0].message.content or ""


class MistralVisionProvider(AbstractVisionProvider):
    @property
    def provider_name(self) -> str:
        return "mistral"

    @property
    def default_model(self) -> str:
        return "pixtral-large-latest"

    async def read(self, images, prompt, *, system=None, json_mode=False, max_tokens=4000,
                   temperature=0, mime="image/png") -> str:
        from mistralai import Mistral

        contenu = []
        for i, img in enumerate(images, 1):
            contenu.append({"type": "text", "text": f"Page {i} :"})
            contenu.append({"type": "image_url", "image_url": _data_url(img, mime)})
        contenu.append({"type": "text", "text": prompt})
        messages = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": contenu}]
        extra = {"response_format": {"type": "json_object"}} if json_mode else {}
        resp = await Mistral(api_key=self._api_key).chat.complete_async(
            model=self._model_name,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=messages,
            **extra,
        )
        return resp.choices[0].message.content or ""


VISION_REGISTRY: dict[str, type[AbstractVisionProvider]] = {
    "openai": OpenAIVisionProvider,
    "mistral": MistralVisionProvider,
}
