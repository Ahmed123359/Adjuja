from fastapi import APIRouter, Depends, HTTPException
from app.models.history import HistoryEntry, HistorySummary
from app.models.user import UserPublic
from app.services.history_service import HistoryService
from app.api.dependencies import get_history_service, get_current_user

router = APIRouter(prefix="/history", tags=["Historique"])


@router.get("", response_model=list[HistorySummary])
def list_history(
    svc:          HistoryService = Depends(get_history_service),
    current_user: UserPublic     = Depends(get_current_user),
):
    """Retourne la liste des générations de l'utilisateur connecté."""
    return svc.list_summaries(user_id=current_user.id)


@router.get("/{entry_id}", response_model=HistoryEntry)
def get_entry(
    entry_id:     str,
    svc:          HistoryService = Depends(get_history_service),
    current_user: UserPublic     = Depends(get_current_user),
):
    """Retourne une entrée complète appartenant à l'utilisateur connecté."""
    entry = svc.get(entry_id, user_id=current_user.id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entrée introuvable.")
    return entry


@router.delete("/{entry_id}")
def delete_entry(
    entry_id:     str,
    svc:          HistoryService = Depends(get_history_service),
    current_user: UserPublic     = Depends(get_current_user),
):
    """Supprime une entrée appartenant à l'utilisateur connecté."""
    if not svc.delete(entry_id, user_id=current_user.id):
        raise HTTPException(status_code=404, detail="Entrée introuvable.")
    return {"success": True}


@router.delete("")
def clear_history(
    svc:          HistoryService = Depends(get_history_service),
    current_user: UserPublic     = Depends(get_current_user),
):
    """Vide l'historique de l'utilisateur connecté."""
    svc.clear(user_id=current_user.id)
    return {"success": True}
