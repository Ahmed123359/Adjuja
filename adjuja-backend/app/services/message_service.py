"""Discussion d'équipe : lecture et écriture d'un fil.

Voir `context/feature-spec/dashboard-risque-validations/00-overview.md`.

Un fil est déterminé par le couple (task_id, ao_id) :

  - les deux nuls        -> canal général de l'organisation ;
  - `task_id` renseigné  -> fil de cette tâche ;
  - `ao_id` renseigné    -> fil de ce dossier.

Portée : tout ce qui est lu ou écrit appartient à l'organisation de l'appelant.
Un message d'une autre organisation n'est jamais visible, et un `task_id` ou un
`ao_id` d'ailleurs est refusé -- sans cette vérification, n'importe qui pourrait
écrire dans le fil d'un dossier qu'il ne voit pas.
"""
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select

from app.db.base import AsyncSessionLocal
from app.db.models import AoTask, AppelOffre, TeamMessage, User
from app.models.message import MessageCreate, MessageListOut, MessageOut, MessageRef

logger = logging.getLogger(__name__)

# Un fil se lit par paquets : charger trois ans de conversation pour afficher
# les vingt derniers messages ne rendrait service à personne.
LIMITE_DEFAUT = 50
LIMITE_MAX = 200


class MessageError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _nom(u: User | None) -> str:
    if u is None:
        return ""
    return f"{u.prenom or ''} {u.nom or ''}".strip() or (u.email or "")


def _sortie(m: TeamMessage, noms: dict[str, str]) -> MessageOut:
    return MessageOut(
        id=m.id,
        org_id=m.org_id,
        author_id=m.author_id,
        author_nom=noms.get(m.author_id, ""),
        body=m.body,
        task_id=m.task_id,
        ao_id=m.ao_id,
        mentions=list(m.mentions or []),
        refs=[MessageRef(**r) for r in (m.refs or [])],
        created_at=m.created_at,
    )


async def list_messages(
    org_id: str,
    task_id: str | None = None,
    ao_id: str | None = None,
    limit: int = LIMITE_DEFAUT,
) -> MessageListOut:
    """Les derniers messages d'un fil, rendus dans l'ordre chronologique.

    La requête prend les N plus RÉCENTS (tri décroissant), puis la liste est
    remise à l'endroit avant d'être renvoyée : on veut la fin d'une
    conversation, affichée dans le sens de la lecture.
    """
    limit = max(1, min(limit, LIMITE_MAX))

    async with AsyncSessionLocal() as session:
        conditions = [TeamMessage.org_id == org_id, TeamMessage.deleted_at.is_(None)]
        # Un fil est un contexte exact : le canal général ne doit pas ramasser
        # les messages des tâches, sinon il devient illisible.
        conditions.append(TeamMessage.task_id == task_id if task_id else TeamMessage.task_id.is_(None))
        conditions.append(TeamMessage.ao_id == ao_id if ao_id else TeamMessage.ao_id.is_(None))

        total = (await session.execute(
            select(func.count()).select_from(TeamMessage).where(*conditions)
        )).scalar_one()

        lignes = (await session.execute(
            select(TeamMessage).where(*conditions)
            .order_by(TeamMessage.created_at.desc())
            .limit(limit)
        )).scalars().all()

        messages = list(reversed(lignes))
        noms = await _noms_des_auteurs(session, {m.author_id for m in messages})

    return MessageListOut(items=[_sortie(m, noms) for m in messages], total=total)


async def _noms_des_auteurs(session, ids: set[str]) -> dict[str, str]:
    """Un seul IN pour tous les auteurs du paquet, plutôt qu'une requête par
    message."""
    if not ids:
        return {}
    users = (await session.execute(select(User).where(User.id.in_(ids)))).scalars().all()
    return {u.id: _nom(u) for u in users}


async def create_message(org_id: str, author_id: str, data: MessageCreate) -> MessageOut:
    async with AsyncSessionLocal() as session:
        # Le fil visé doit appartenir à l'organisation. Sans ce contrôle, un
        # identifiant deviné suffirait à écrire dans le dossier d'autrui.
        if data.task_id:
            tache = (await session.execute(
                select(AoTask).where(AoTask.id == data.task_id, AoTask.org_id == org_id)
            )).scalar_one_or_none()
            if tache is None:
                raise MessageError(404, "Tâche introuvable.")

        if data.ao_id:
            ao = (await session.execute(
                select(AppelOffre).where(AppelOffre.id == data.ao_id, AppelOffre.org_id == org_id)
            )).scalar_one_or_none()
            if ao is None:
                raise MessageError(404, "Appel d'offres introuvable.")

        # Les mentions sont filtrées sur les membres réels de l'organisation :
        # mentionner quelqu'un d'ailleurs ne veut rien dire, et laisser passer
        # des identifiants arbitraires polluerait les notifications à venir.
        mentions: list[str] = []
        if data.mentions:
            membres = (await session.execute(
                select(User.id).where(User.id.in_(data.mentions))
            )).scalars().all()
            connus = set(membres)
            mentions = [uid for uid in dict.fromkeys(data.mentions) if uid in connus]

        message = TeamMessage(
            id=str(uuid.uuid4()),
            org_id=org_id,
            author_id=author_id,
            body=data.body,
            task_id=data.task_id,
            ao_id=data.ao_id,
            mentions=mentions or None,
            refs=[r.model_dump() for r in data.refs] or None,
            created_at=_now(),
        )
        session.add(message)
        await session.commit()
        await session.refresh(message)

        noms = await _noms_des_auteurs(session, {author_id})
        return _sortie(message, noms)


async def delete_message(org_id: str, user_id: str, message_id: str) -> None:
    """Masque un message. Seul son auteur peut le retirer.

    Il n'existe pas de rôle d'organisation (voir `dashboard_routes.py`) : à
    défaut de pouvoir dire « un responsable peut modérer », la règle la plus
    sûre est que chacun ne dispose que de ses propres messages.
    """
    async with AsyncSessionLocal() as session:
        message = (await session.execute(
            select(TeamMessage).where(
                TeamMessage.id == message_id,
                TeamMessage.org_id == org_id,
                TeamMessage.deleted_at.is_(None),
            )
        )).scalar_one_or_none()

        if message is None:
            raise MessageError(404, "Message introuvable.")
        if message.author_id != user_id:
            raise MessageError(403, "Seul l'auteur peut supprimer son message.")

        message.deleted_at = _now()
        await session.commit()
