"""Suivi d'un dossier après dépôt : étapes, offres lues en séance, classement
prévu selon le décret 2-22-431. Spec :
context/feature-spec/suivi-resultats/00-overview.md (phase 1).

Même espace que les dossiers (/api/v1/ao/{ao_id}/...), fichier à part pour ne
pas alourdir ao_routes.py. Les routes valident, appellent suivi_service et
traduisent le résultat : 404 pour un dossier absent ou d'une autre
organisation.
"""

from fastapi import APIRouter, Depends, HTTPException, Path, status

from app.api.dependencies import get_current_user
from app.models.suivi import OffresIn, SuiviIn, SuiviOut
from app.models.user import UserPublic
from app.services import suivi_service

suivi_router = APIRouter(prefix="/ao", tags=["Suivi des dossiers"])

_INTROUVABLE = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dossier introuvable.")
_AO_ID = Path(..., max_length=36)


def _org(user: UserPublic) -> str:
    return user.org_id or user.id


@suivi_router.get("/{ao_id}/suivi", response_model=SuiviOut)
async def lire_suivi(ao_id: str = _AO_ID, current_user: UserPublic = Depends(get_current_user)) -> SuiviOut:
    try:
        return await suivi_service.lire(ao_id, _org(current_user))
    except suivi_service.SuiviIntrouvable:
        raise _INTROUVABLE


@suivi_router.put("/{ao_id}/suivi", response_model=SuiviOut)
async def enregistrer_suivi(
    body: SuiviIn, ao_id: str = _AO_ID, current_user: UserPublic = Depends(get_current_user),
) -> SuiviOut:
    try:
        return await suivi_service.enregistrer(ao_id, _org(current_user), current_user.id, body)
    except suivi_service.SuiviIntrouvable:
        raise _INTROUVABLE


@suivi_router.put("/{ao_id}/suivi/offres", response_model=SuiviOut)
async def enregistrer_offres(
    body: OffresIn, ao_id: str = _AO_ID, current_user: UserPublic = Depends(get_current_user),
) -> SuiviOut:
    try:
        return await suivi_service.enregistrer_offres(ao_id, _org(current_user), body.offres)
    except suivi_service.SuiviIntrouvable:
        raise _INTROUVABLE
