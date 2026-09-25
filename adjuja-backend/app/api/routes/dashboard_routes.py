"""Tableau de bord collaboratif : résumé, calendrier et tâches d'équipe.

Voir `context/feature-spec/dashboard-collaboratif/api.md`. Les routes ne portent
aucune logique métier : elles valident, appellent un service, traduisent le
résultat en réponse HTTP.

Portée : tout ce qui est lu ou écrit ici appartient à l'organisation de
l'appelant, résolue par le patron habituel `current_user.org_id or
current_user.id`. Il n'existe pas encore de rôle d'organisation (décision
assumée, voir la spec) : tout membre voit et modifie les tâches de son
organisation, exactement comme il peut déjà inviter et retirer des membres.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.dependencies import get_current_user
from app.models.dashboard import (
    AtRiskOut,
    CalendarEvent,
    DashboardSummary,
    PendingValidationsOut,
)
from app.models.message import MessageCreate, MessageListOut, MessageOut
from app.models.task import TaskCreate, TaskListOut, TaskOut, TaskUpdate
from app.models.user import UserPublic
from app.services import dashboard_service, message_service, task_service

logger = logging.getLogger(__name__)

dashboard_router = APIRouter(prefix="/dashboard", tags=["Tableau de bord"])
tasks_router = APIRouter(prefix="/tasks", tags=["Tâches"])
messages_router = APIRouter(prefix="/messages", tags=["Discussion"])


def _org_id(user: UserPublic) -> str:
    return user.org_id or user.id


# --------------------------------------------------------------------------- #
#  Tableau de bord                                                             #
# --------------------------------------------------------------------------- #

@dashboard_router.get("/summary", response_model=DashboardSummary)
async def get_summary(
    current_user: UserPublic = Depends(get_current_user),
) -> DashboardSummary:
    """Les tuiles du haut d'écran en un appel, là où l'ancien onglet chargeait la
    liste complète des AO, celle de la veille et l'abonnement pour quatre nombres."""
    return await dashboard_service.summary(_org_id(current_user), current_user.id)


@dashboard_router.get("/calendar", response_model=list[CalendarEvent])
async def get_calendar(
    date_from: str = Query(..., alias="from", description="AAAA-MM-JJ"),
    date_to: str = Query(..., alias="to", description="AAAA-MM-JJ"),
    current_user: UserPublic = Depends(get_current_user),
) -> list[CalendarEvent]:
    try:
        return await dashboard_service.calendar(_org_id(current_user), date_from, date_to)
    except dashboard_service.CalendarError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@dashboard_router.get("/at-risk", response_model=AtRiskOut)
async def get_at_risk(
    limit: int = Query(10, ge=1, le=50),
    current_user: UserPublic = Depends(get_current_user),
) -> AtRiskOut:
    """Les AO dont l'échéance approche plus vite que le dossier n'avance.

    Le risque croise la date limite ET la progression : une date limite seule ne
    dit rien, un dossier à rendre dans deux jours et terminé à 95 % va bien.
    Voir `context/feature-spec/dashboard-risque-validations/00-overview.md`.
    """
    return await dashboard_service.at_risk(_org_id(current_user), limit)


@dashboard_router.get("/pending-validations", response_model=PendingValidationsOut)
async def get_pending_validations(
    limit: int = Query(10, ge=1, le=50),
    current_user: UserPublic = Depends(get_current_user),
) -> PendingValidationsOut:
    """Les étapes du mode accompagné arrêtées sur une validation humaine.

    La table `ao_pipeline_steps` a été créée pour répondre à cette question
    (voir sa docstring) sans jamais être branchée au tableau de bord.
    """
    return await dashboard_service.pending_validations(_org_id(current_user), limit)

# --------------------------------------------------------------------------- #
#  Tâches                                                                      #
# --------------------------------------------------------------------------- #

@tasks_router.get("", response_model=TaskListOut)
async def list_tasks(
    assignee: str | None = Query(None, description="me, unassigned ou un user_id"),
    statut: str | None = Query(None, description="a_faire, en_cours, faite ou ouvertes"),
    ao_id: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    current_user: UserPublic = Depends(get_current_user),
) -> TaskListOut:
    items, total = await task_service.list_tasks(
        org_id=_org_id(current_user),
        current_user_id=current_user.id,
        assignee=assignee,
        statut=statut,
        ao_id=ao_id,
        page=page,
        limit=limit,
    )
    return TaskListOut(items=items, total=total, page=page, limit=limit)


@tasks_router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def create_task(
    body: TaskCreate,
    current_user: UserPublic = Depends(get_current_user),
) -> TaskOut:
    try:
        return await task_service.create_task(_org_id(current_user), current_user.id, body)
    except task_service.TaskError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@tasks_router.get("/{task_id}", response_model=TaskOut)
async def get_task(
    task_id: str,
    current_user: UserPublic = Depends(get_current_user),
) -> TaskOut:
    try:
        return await task_service.get_task(_org_id(current_user), task_id)
    except task_service.TaskError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@tasks_router.patch("/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: str,
    body: TaskUpdate,
    current_user: UserPublic = Depends(get_current_user),
) -> TaskOut:
    try:
        return await task_service.update_task(_org_id(current_user), task_id, body)
    except task_service.TaskError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@tasks_router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: str,
    current_user: UserPublic = Depends(get_current_user),
) -> None:
    try:
        await task_service.delete_task(_org_id(current_user), task_id)
    except task_service.TaskError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


# --------------------------------------------------------------------------- #
#  Discussion d'équipe                                                         #
# --------------------------------------------------------------------------- #

@messages_router.get("", response_model=MessageListOut)
async def list_messages(
    task_id: str | None = Query(None, description="Fil d'une tâche"),
    ao_id: str | None = Query(None, description="Fil d'un dossier"),
    limit: int = Query(50, ge=1, le=200),
    current_user: UserPublic = Depends(get_current_user),
) -> MessageListOut:
    """Les derniers messages d'un fil, dans l'ordre de lecture.

    Sans `task_id` ni `ao_id`, c'est le canal général de l'organisation.
    """
    return await message_service.list_messages(
        org_id=_org_id(current_user), task_id=task_id, ao_id=ao_id, limit=limit,
    )


@messages_router.post("", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
async def create_message(
    data: MessageCreate,
    current_user: UserPublic = Depends(get_current_user),
) -> MessageOut:
    try:
        return await message_service.create_message(_org_id(current_user), current_user.id, data)
    except message_service.MessageError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@messages_router.delete("/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    message_id: str,
    current_user: UserPublic = Depends(get_current_user),
) -> None:
    try:
        await message_service.delete_message(_org_id(current_user), current_user.id, message_id)
    except message_service.MessageError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
