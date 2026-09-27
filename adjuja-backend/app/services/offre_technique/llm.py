"""
Appels au modele pour l'offre technique (2026-09-27, spec
context/feature-spec/fournisseurs-ia/, lot 2).

Les cinq modules appelaient l'API Mistral en HTTP direct, modele en dur. Ils
passent desormais par un ROLE (`fast` pour l'extraction et la relecture,
`analysis` pour la redaction), choisi dans .env, avec la meme politique de
relance sur limitation de debit (429) qu'avant, quel que soit le fournisseur.

Execution : les providers appellent des SDK synchrones depuis des methodes
`async`. Awaiter ces methodes directement bloquerait la boucle et rendrait
sequentielle la redaction des sections, lancee en parallele. Chaque appel
tourne donc dans un thread de travail, avec sa propre boucle.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Literal

logger = logging.getLogger(__name__)

Role = Literal["analysis", "fast"]


def _est_limite_debit(exc: BaseException) -> bool:
    code = getattr(exc, "status_code", None) or getattr(getattr(exc, "response", None), "status_code", None)
    return code == 429 or "RateLimit" in type(exc).__name__


def _appel_bloquant(role: Role, system: str, user: str, temperature: float, max_tokens: int, json_mode: bool) -> str:
    from app.providers.router import get_chat

    provider = get_chat(role)
    texte, _tokens = asyncio.run(
        provider.generate_text(system, user, max_tokens, temperature, json_mode=json_mode)
    )
    return (texte or "").strip()


async def appeler(
    role: Role,
    system: str,
    user: str,
    *,
    temperature: float,
    max_tokens: int,
    json_mode: bool = False,
    retry_delays: tuple[int, ...] = (10, 30, 60),
) -> str:
    """Reponse du modele du role, avec relances sur 429. Leve l'erreur sinon."""
    for tentative, delai in enumerate((*retry_delays, None), start=1):
        try:
            return await asyncio.to_thread(
                _appel_bloquant, role, system, user, temperature, max_tokens, json_mode,
            )
        except Exception as exc:
            if delai is None or not _est_limite_debit(exc):
                raise
            logger.warning("Limitation de debit (%s, tentative %d), attente %ds", role, tentative, delai)
            await asyncio.sleep(delai)
    raise RuntimeError("inatteignable")


def appeler_sync(role: Role, system: str, user: str, **kwargs) -> str:
    """Version pour les modules synchrones (executes hors boucle, via
    `asyncio.to_thread` dans `offre_technique_service`)."""
    return asyncio.run(appeler(role, system, user, **kwargs))
