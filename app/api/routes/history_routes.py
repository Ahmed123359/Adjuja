from fastapi import APIRouter, Depends, HTTPException
from app.models.history import HistoryEntry, HistorySummary
from app.services.history_service import HistoryService
from app.api.dependencies import get_history_service

router = APIRouter(prefix="/history", tags=["Historique"])


@router.get("", response_model=list[HistorySummary])
def list_history(svc: HistoryService = Depends(get_history_service)):
    """Retourne la liste des générations passées (sans résultat complet)."""
    return svc.list_summaries()


@router.get("/{entry_id}", response_model=HistoryEntry)
def get_entry(entry_id: str, svc: HistoryService = Depends(get_history_service)):
    """Retourne une entrée complète avec son résultat."""
    entry = svc.get(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entrée introuvable.")
    return entry


@router.delete("/{entry_id}")
def delete_entry(entry_id: str, svc: HistoryService = Depends(get_history_service)):
    """Supprime une entrée de l'historique."""
    if not svc.delete(entry_id):
        raise HTTPException(status_code=404, detail="Entrée introuvable.")
    return {"success": True}


@router.delete("")
def clear_history(svc: HistoryService = Depends(get_history_service)):
    """Vide tout l'historique."""
    svc.clear()
    return {"success": True}
