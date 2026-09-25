"""Étape courante d'un téléchargement de documents (AO ou BDC), tenue en Redis.

La base ne dit que « pas encore téléchargé » : sans cette trace, l'écran ne peut
afficher qu'un « en cours » figé du premier au dernier instant, alors que la tâche
traverse des étapes de plusieurs secondes chacune (mesure réelle du 2026-09-14 :
page du portail, formulaire, préparation du dossier, réception du fichier) et
peut attendre 60 s entre deux tentatives. Même principe que l'état des outils
signature/remplissage de l'application principale (`tools_tasks.py`).

L'écriture ne doit jamais faire échouer un téléchargement : toute erreur Redis
est journalisée puis ignorée.
"""

import json
import time

import redis as redis_lib
import redis.asyncio as aioredis
import structlog
from pydantic import BaseModel

from app.core.config import settings

log = structlog.get_logger(__name__)

_KEY = "download:progress:{kind}:{item_id}"
# Largement au-dessus d'un cycle complet de relances (~8 min observées) : au-delà,
# une trace restante ne peut venir que d'un worker arrêté en plein travail.
_TTL_SECONDS = 1800

_async_client: aioredis.Redis | None = None


class DownloadProgressOut(BaseModel):
    etape: str
    tentative: int | None = None
    max_tentatives: int | None = None
    elapsed_s: int
    retry_in_s: int | None = None


def _key(kind: str, item_id: int) -> str:
    return _KEY.format(kind=kind, item_id=item_id)


def set_step(kind: str, item_id: int, etape: str, **extra: int | float) -> None:
    """Depuis une tâche Celery (synchrone). Conserve l'heure de début d'origine."""
    try:
        r = redis_lib.from_url(settings.redis_url, decode_responses=True)
        key = _key(kind, item_id)
        raw = r.get(key)
        now = time.time()
        data = json.loads(raw) if raw else {"debut": now}
        if etape != "nouvelle_tentative":
            data.pop("prochaine_tentative", None)
        data.update({"etape": etape, **extra})
        r.set(key, json.dumps(data), ex=_TTL_SECONDS)
    except Exception as exc:
        log.warning("Download progress write failed", kind=kind, item_id=item_id, error=str(exc))


def clear(kind: str, item_id: int) -> None:
    try:
        redis_lib.from_url(settings.redis_url, decode_responses=True).delete(_key(kind, item_id))
    except Exception as exc:
        log.warning("Download progress clear failed", kind=kind, item_id=item_id, error=str(exc))


def _get_async_client() -> aioredis.Redis:
    global _async_client
    if _async_client is None:
        _async_client = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _async_client


async def mark_queued(kind: str, item_id: int) -> None:
    """Depuis la route qui lance le téléchargement. Repart de zéro : une trace
    laissée par un téléchargement précédent ne doit pas fausser le temps écoulé."""
    try:
        await _get_async_client().set(
            _key(kind, item_id),
            json.dumps({"debut": time.time(), "etape": "en_file"}),
            ex=_TTL_SECONDS,
        )
    except Exception as exc:
        log.warning("Download progress queue mark failed", kind=kind, item_id=item_id, error=str(exc))


async def read(kind: str, item_id: int) -> DownloadProgressOut | None:
    """Temps écoulé et délai avant relance calculés ici, pas dans le navigateur :
    l'horloge du poste de l'utilisateur n'est pas celle du serveur."""
    try:
        raw = await _get_async_client().get(_key(kind, item_id))
    except Exception as exc:
        log.warning("Download progress read failed", kind=kind, item_id=item_id, error=str(exc))
        return None
    if not raw:
        return None
    data = json.loads(raw)
    now = time.time()
    prochaine = data.get("prochaine_tentative")
    return DownloadProgressOut(
        etape=data["etape"],
        tentative=data.get("tentative"),
        max_tentatives=data.get("max_tentatives"),
        elapsed_s=max(0, int(now - data.get("debut", now))),
        retry_in_s=max(0, int(prochaine - now)) if prochaine else None,
    )
