"""Actions de maintenance lancees depuis le panneau d'administration.

Voir context/feature-spec/admin-panel/api.md (module Veille, actions) et
app/modules/admin/router.py qui les declenche.

Une seule execution a la fois par action : verrou Redis pose par la route
avant l'envoi, libere ici a la fin (ou par expiration si le worker meurt).
"""

import redis as redis_lib
import structlog

from app.core.config import settings
from app.modules.maintenance import SOURCES_AO, enrichir_analyses, rattraper_details
from app.workers.celery_app import celery_app
from app.workers.utils import run_async

log = structlog.get_logger(__name__)

RATTRAPAGE, ENRICHISSEMENT = "rattrapage-details", "enrichir-analyses"
_VERROU_PREFIXE = "admin:tache:"
# Plus long que l'operation la plus longue raisonnable (~100 analyses) ; au-dela
# le verrou tombe seul si le worker est mort en route.
VERROU_SECONDES = 2 * 3600


def _redis() -> redis_lib.Redis:
    return redis_lib.from_url(settings.redis_url, decode_responses=True)


def prendre_verrou(action: str, task_id: str) -> str | None:
    """Pose le verrou ; renvoie None si pris, sinon la tache qui le tient."""
    cle = _VERROU_PREFIXE + action
    r = _redis()
    if r.set(cle, task_id, nx=True, ex=VERROU_SECONDES):
        return None
    return r.get(cle) or "?"


def liberer_verrou(action: str) -> None:
    try:
        _redis().delete(_VERROU_PREFIXE + action)
    except Exception as exc:
        log.warning("Verrou d'action non libere", action=action, error=str(exc))


def _progression(tache):
    def signaler(fait: int, total: int) -> None:
        tache.update_state(state="PROGRESS", meta={"fait": fait, "total": total})
    return signaler


# acks_late=False : ces operations peuvent approcher l'heure, delai au-dela
# duquel Redis redistribue un message non acquitte ; une seconde execution
# concurrente doublerait les appels au modele.
@celery_app.task(name="app.workers.tasks.admin_tasks.tache_rattraper_details", bind=True, acks_late=False)
def tache_rattraper_details(self, reel: bool = False, limite: int | None = None, source: str | None = None) -> dict:
    try:
        sources = (source,) if source else SOURCES_AO
        return run_async(rattraper_details(reel, limite, 1.5, sources, _progression(self)))
    finally:
        liberer_verrou(RATTRAPAGE)


@celery_app.task(name="app.workers.tasks.admin_tasks.tache_enrichir_analyses", bind=True, acks_late=False)
def tache_enrichir_analyses(self, reel: bool = False, limite: int | None = None) -> dict:
    try:
        return run_async(enrichir_analyses(reel, limite, 3.0, _progression(self)))
    finally:
        liberer_verrou(ENRICHISSEMENT)
