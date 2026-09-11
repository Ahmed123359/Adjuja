from fastapi import APIRouter, Depends, HTTPException
from app.models.history import HistoryEntry, HistorySummary
from app.models.user import UserPublic
from app.services.history_service import HistoryService
from app.api.dependencies import get_history_service, get_current_user

router = APIRouter(prefix="/history", tags=["Historique"])


@router.get("", response_model=list[HistorySummary])
async def list_history(
    svc:          HistoryService = Depends(get_history_service),
    current_user: UserPublic     = Depends(get_current_user),
):
    return await svc.list_summaries(user_id=current_user.id)


@router.get("/{entry_id}", response_model=HistoryEntry)
async def get_entry(
    entry_id:     str,
    svc:          HistoryService = Depends(get_history_service),
    current_user: UserPublic     = Depends(get_current_user),
):
    entry = await svc.get(entry_id, user_id=current_user.id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entrée introuvable.")
    return entry


@router.delete("/{entry_id}")
async def delete_entry(
    entry_id:     str,
    svc:          HistoryService = Depends(get_history_service),
    current_user: UserPublic     = Depends(get_current_user),
):
    if not await svc.delete(entry_id, user_id=current_user.id):
        raise HTTPException(status_code=404, detail="Entrée introuvable.")
    return {"success": True}


@router.delete("")
async def clear_history(
    svc:          HistoryService = Depends(get_history_service),
    current_user: UserPublic     = Depends(get_current_user),
):
    await svc.clear(user_id=current_user.id)
    return {"success": True}
