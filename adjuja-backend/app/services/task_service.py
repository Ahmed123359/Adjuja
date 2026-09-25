"""Tâches d'équipe : règles métier, portée organisation, validations.

Voir `context/feature-spec/dashboard-collaboratif/api.md`.

Deux points qui ne doivent pas être contournés :

1. **Tout passe par l'organisation.** `org_id` est résolu par l'appelant avec le
   patron habituel (`current_user.org_id or current_user.id`) et sert de filtre à
   chaque lecture comme à chaque écriture. Une tâche d'une autre organisation est
   introuvable, jamais interdite : un 403 confirmerait son existence.
2. **L'appartenance d'un assigné se vérifie comme dans `GET /org/members`.** Le
   propriétaire d'une organisation qui n'a jamais invité personne a un `org_id`
   NULL en base, donc `list_by_org` ne le trouve pas : c'est le cas que
   `get_org_owner_id` rattrape. Réimplémenter ce test autrement reviendrait à
   rendre impossible de s'assigner une tâche à soi-même quand on est seul.
"""
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import Select, func, select

from app.db.base import AsyncSessionLocal
from app.db.models import AoTask, AppelOffre
from app.models.task import TaskCreate, TaskOut, TaskUpdate
from app.services.user_service import UserService

logger = logging.getLogger(__name__)

OPEN_STATUTS = ("a_faire", "en_cours")


class TaskError(Exception):
    """Erreur métier traduite telle quelle en réponse HTTP par la route."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_out(task: AoTask, ao: AppelOffre | None = None) -> TaskOut:
    return TaskOut(
        id=task.id,
        org_id=task.org_id,
        ao_id=task.ao_id,
        titre=task.titre,
        description=task.description,
        assignee_id=task.assignee_id,
        created_by=task.created_by,
        statut=task.statut,  # type: ignore[arg-type]
        echeance=task.echeance,
        created_at=task.created_at,
        updated_at=task.updated_at,
        completed_at=task.completed_at,
        ao_reference=ao.reference if ao else None,
        ao_objet=ao.objet if ao else None,
    )


def _order_by_echeance(stmt: Select) -> Select:
    """Échéances croissantes, tâches sans échéance en dernier : `NULL` trierait
    en premier en Postgres sur un tri croissant, ce qui mettrait justement les
    tâches sans date en tête de liste."""
    return stmt.order_by(func.coalesce(AoTask.echeance, "9999").asc(), AoTask.created_at.asc())


async def _assert_member(session, org_id: str, user_id: str) -> None:
    users = UserService(session)
    membres = await users.list_by_org(org_id)
    owner_id = await users.get_org_owner_id(org_id) or org_id
    if user_id != owner_id and not any(m.id == user_id for m in membres):
        raise TaskError(400, "Cette personne ne fait pas partie de votre organisation.")


async def _assert_ao(session, org_id: str, ao_id: str) -> None:
    found = await session.execute(
        select(AppelOffre.id).where(AppelOffre.id == ao_id, AppelOffre.org_id == org_id)
    )
    if found.scalar_one_or_none() is None:
        raise TaskError(400, "Cet appel d'offres n'existe pas dans votre organisation.")


async def list_tasks(
    org_id: str,
    current_user_id: str,
    assignee: str | None = None,
    statut: str | None = None,
    ao_id: str | None = None,
    page: int = 1,
    limit: int = 50,
) -> tuple[list[TaskOut], int]:
    async with AsyncSessionLocal() as session:
        stmt = select(AoTask).where(AoTask.org_id == org_id)

        if assignee == "me":
            stmt = stmt.where(AoTask.assignee_id == current_user_id)
        elif assignee == "unassigned":
            stmt = stmt.where(AoTask.assignee_id.is_(None))
        elif assignee:
            stmt = stmt.where(AoTask.assignee_id == assignee)

        if statut == "ouvertes":
            stmt = stmt.where(AoTask.statut.in_(OPEN_STATUTS))
        elif statut:
            stmt = stmt.where(AoTask.statut == statut)

        if ao_id:
            stmt = stmt.where(AoTask.ao_id == ao_id)

        total = (await session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()

        stmt = _order_by_echeance(stmt).offset((page - 1) * limit).limit(limit)
        tasks = list((await session.execute(stmt)).scalars().all())

        # Un seul aller-retour pour les AO liés, plutôt qu'une requête par tâche.
        ao_ids = {t.ao_id for t in tasks if t.ao_id}
        aos: dict[str, AppelOffre] = {}
        if ao_ids:
            rows = (await session.execute(select(AppelOffre).where(AppelOffre.id.in_(ao_ids)))).scalars().all()
            aos = {a.id: a for a in rows}

    return [_to_out(t, aos.get(t.ao_id) if t.ao_id else None) for t in tasks], total


async def get_task(org_id: str, task_id: str) -> TaskOut:
    async with AsyncSessionLocal() as session:
        task = await _load(session, org_id, task_id)
        ao = None
        if task.ao_id:
            ao = (await session.execute(select(AppelOffre).where(AppelOffre.id == task.ao_id))).scalar_one_or_none()
        return _to_out(task, ao)


async def _load(session, org_id: str, task_id: str) -> AoTask:
    task = (await session.execute(
        select(AoTask).where(AoTask.id == task_id, AoTask.org_id == org_id)
    )).scalar_one_or_none()
    if task is None:
        raise TaskError(404, "Tâche introuvable.")
    return task


async def create_task(org_id: str, created_by: str, data: TaskCreate) -> TaskOut:
    now = _now_iso()
    async with AsyncSessionLocal() as session:
        if data.assignee_id:
            await _assert_member(session, org_id, data.assignee_id)
        if data.ao_id:
            await _assert_ao(session, org_id, data.ao_id)

        task = AoTask(
            id=str(uuid.uuid4()),
            org_id=org_id,
            ao_id=data.ao_id,
            titre=data.titre.strip(),
            description=data.description,
            assignee_id=data.assignee_id,
            created_by=created_by,
            statut=data.statut,
            echeance=data.echeance,
            created_at=now,
            updated_at=now,
            completed_at=now if data.statut == "faite" else None,
        )
        session.add(task)
        await session.commit()
        logger.info("[tasks] créée id=%s org=%s assignee=%s", task.id, org_id, task.assignee_id)
        return _to_out(task)


async def update_task(org_id: str, task_id: str, data: TaskUpdate) -> TaskOut:
    async with AsyncSessionLocal() as session:
        task = await _load(session, org_id, task_id)
        payload = data.model_dump(exclude_unset=True)

        if payload.get("assignee_id"):
            await _assert_member(session, org_id, payload["assignee_id"])
        if payload.get("ao_id"):
            await _assert_ao(session, org_id, payload["ao_id"])

        for champ, valeur in payload.items():
            setattr(task, champ, valeur.strip() if champ == "titre" and valeur else valeur)

        if "statut" in payload:
            # Une tâche rouverte qui garderait sa date d'achèvement afficherait
            # « faite le ... » tout en étant à faire.
            task.completed_at = _now_iso() if payload["statut"] == "faite" else None

        task.updated_at = _now_iso()
        await session.commit()

        ao = None
        if task.ao_id:
            ao = (await session.execute(select(AppelOffre).where(AppelOffre.id == task.ao_id))).scalar_one_or_none()
        logger.info("[tasks] modifiée id=%s org=%s champs=%s", task.id, org_id, list(payload))
        return _to_out(task, ao)


async def delete_task(org_id: str, task_id: str) -> None:
    async with AsyncSessionLocal() as session:
        task = await _load(session, org_id, task_id)
        await session.delete(task)
        await session.commit()
        logger.info("[tasks] supprimée id=%s org=%s", task_id, org_id)


async def count_open(session, org_id: str, user_id: str | None = None) -> int:
    stmt = select(func.count()).select_from(AoTask).where(
        AoTask.org_id == org_id, AoTask.statut.in_(OPEN_STATUTS)
    )
    if user_id:
        stmt = stmt.where(AoTask.assignee_id == user_id)
    return (await session.execute(stmt)).scalar_one()


async def count_overdue(session, org_id: str, today: str) -> int:
    """Tâches ouvertes dont l'échéance est dépassée. Comparaison sur les 10
    premiers caractères : l'échéance peut être une date seule ou un ISO complet."""
    stmt = select(func.count()).select_from(AoTask).where(
        AoTask.org_id == org_id,
        AoTask.statut.in_(OPEN_STATUTS),
        AoTask.echeance.is_not(None),
        func.substr(AoTask.echeance, 1, 10) < today,
    )
    return (await session.execute(stmt)).scalar_one()


async def list_between(session, org_id: str, date_from: str, date_to: str) -> list[AoTask]:
    stmt = select(AoTask).where(
        AoTask.org_id == org_id,
        AoTask.echeance.is_not(None),
        func.substr(AoTask.echeance, 1, 10) >= date_from,
        func.substr(AoTask.echeance, 1, 10) <= date_to,
    )
    return list((await session.execute(_order_by_echeance(stmt))).scalars().all())


__all__ = [
    "TaskError", "list_tasks", "get_task", "create_task", "update_task", "delete_task",
    "count_open", "count_overdue", "list_between", "OPEN_STATUTS",
]
