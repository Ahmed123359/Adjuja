"""Routes d'administration de la veille.

Seul appelant : le backend (panneau d'administration,
context/feature-spec/admin-panel/api.md), qui a deja verifie que l'utilisateur
est administrateur de la plateforme. Ici on verifie le secret partage
`X-Admin-Secret` = WATCHER_ADMIN_SECRET ; secret vide cote veille = tout est
refuse. Le port 8001 etant publie sur Internet, c'est la seule barriere.

Chaque action lance une tache Celery et renvoie son identifiant ; l'etat se
lit par GET /admin/taches/{task_id}.
"""

import secrets
import uuid
from typing import Literal

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, Header, HTTPException, Path
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.scrape_runs import ADMIN
from app.modules.maintenance import SOURCES_AO
from app.workers.celery_app import celery_app
from app.workers.tasks.admin_tasks import (
    ENRICHISSEMENT,
    RATTRAPAGE,
    liberer_verrou,
    prendre_verrou,
    tache_enrichir_analyses,
    tache_rattraper_details,
)
from app.workers.tasks.scrape_bdc_tasks import run_scrape_bdc_pipeline
from app.workers.tasks.scrape_tasks import run_scrape_pipeline


def secret_valide(fourni: str, attendu: str) -> bool:
    return bool(attendu) and secrets.compare_digest(fourni.encode(), attendu.encode())


def _exiger_secret(x_admin_secret: str = Header("", alias="X-Admin-Secret")) -> None:
    if not secret_valide(x_admin_secret, settings.watcher_admin_secret):
        raise HTTPException(status_code=403, detail="Accès refusé.")


router = APIRouter(prefix="/admin", tags=["Administration"], dependencies=[Depends(_exiger_secret)])


class ScrapeIn(BaseModel):
    cible: Literal["ao", "bdc"]


class RattrapageIn(BaseModel):
    reel: bool = False
    limite: int | None = Field(None, ge=1, le=5000)
    source: Literal[SOURCES_AO] | None = None  # type: ignore[valid-type]


class EnrichissementIn(BaseModel):
    reel: bool = False
    # Meme borne que le backend (ActionVeilleIn) : un ecart donnerait un 422
    # incomprehensible au panneau.
    limite: int | None = Field(None, ge=1, le=5000)


class TacheLancee(BaseModel):
    task_id: str
    action: str


class EtatTache(BaseModel):
    etat: Literal["en_attente", "en_cours", "termine", "echec"]
    progression: dict | None = None
    resultat: dict | None = None
    erreur: str | None = None


# États Celery -> états exposés. PENDING vaut aussi pour un identifiant inconnu.
_ETATS = {
    "PENDING": "en_attente", "RECEIVED": "en_attente",
    "STARTED": "en_cours", "PROGRESS": "en_cours", "RETRY": "en_cours",
    "SUCCESS": "termine", "FAILURE": "echec", "REVOKED": "echec",
}


def etat_depuis_celery(statut: str, info: object) -> EtatTache:
    etat = _ETATS.get(statut, "en_cours")
    if etat == "echec":
        return EtatTache(etat=etat, erreur=f"{type(info).__name__}: {info}"[:2000] if info else None)
    if etat == "termine":
        return EtatTache(etat=etat, resultat=info if isinstance(info, dict) else {"valeur": str(info)})
    if statut == "PROGRESS" and isinstance(info, dict):
        return EtatTache(etat=etat, progression={"fait": info.get("fait", 0), "total": info.get("total", 0)})
    return EtatTache(etat=etat)


def _lancer_exclusif(action: str, tache, kwargs: dict) -> TacheLancee:
    task_id = str(uuid.uuid4())
    occupe_par = prendre_verrou(action, task_id)
    if occupe_par:
        raise HTTPException(status_code=409, detail=f"Déjà en cours (tâche {occupe_par}).")
    try:
        tache.apply_async(kwargs=kwargs, task_id=task_id)
    except Exception:
        liberer_verrou(action)
        raise
    return TacheLancee(task_id=task_id, action=action)


@router.post("/scrape", response_model=TacheLancee)
def lancer_scrape(body: ScrapeIn) -> TacheLancee:
    # Pas de verrou : le cooldown d'1 h de la tache protege deja les portails,
    # et le passage refuse est trace (statut « ignore »).
    tache = run_scrape_pipeline if body.cible == "ao" else run_scrape_bdc_pipeline
    res = tache.apply_async(kwargs={"declenchement": ADMIN})
    return TacheLancee(task_id=res.id, action=f"scrape-{body.cible}")


@router.post("/rattrapage-details", response_model=TacheLancee)
def lancer_rattrapage(body: RattrapageIn) -> TacheLancee:
    return _lancer_exclusif(RATTRAPAGE, tache_rattraper_details, body.model_dump())


@router.post("/enrichir-analyses", response_model=TacheLancee)
def lancer_enrichissement(body: EnrichissementIn) -> TacheLancee:
    return _lancer_exclusif(ENRICHISSEMENT, tache_enrichir_analyses, body.model_dump())


@router.get("/taches/{task_id}", response_model=EtatTache)
def etat_tache(task_id: str = Path(..., pattern=r"^[0-9a-f-]{36}$")) -> EtatTache:
    res = AsyncResult(task_id, app=celery_app)
    return etat_depuis_celery(res.state, res.info)
