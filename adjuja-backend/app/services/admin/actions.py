"""Actions du panneau d'administration sur la veille, et leur journal.

Voir `context/feature-spec/admin-panel/api.md` (module Veille, actions ;
journal des actions). Le navigateur ne parle jamais à la veille : le backend
relaie avec le secret partagé (WATCHER_ADMIN_SECRET) et journalise chaque
demande dans `admin_actions` (migration 018), y compris les refus.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select, update

from app.config.settings import Settings
from app.db.base import AsyncSessionLocal
from app.db.models import AdminAction
from app.models.admin import ActionLancee, ActionVeilleIn, EtatAction, JournalAction
from app.models.user import UserPublic

logger = logging.getLogger(__name__)

MODULE_VEILLE = "veille"

# Action exposée -> (route de la veille, corps envoyé). `None` : les
# paramètres de l'administrateur (simulation, limite, source).
ACTIONS_VEILLE: dict[str, tuple[str, dict[str, str] | None]] = {
    "scrape-ao": ("/admin/scrape", {"cible": "ao"}),
    "scrape-bdc": ("/admin/scrape", {"cible": "bdc"}),
    "rattrapage-details": ("/admin/rattrapage-details", None),
    "enrichir-analyses": ("/admin/enrichir-analyses", None),
}

_ETATS_FINAUX = {"termine": "termine", "echec": "echec"}
_DELAI_SECONDES = 10.0


class ActionErreur(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _maintenant() -> str:
    return datetime.now(timezone.utc).isoformat()


def corps_action(action: str, params: ActionVeilleIn) -> dict[str, Any]:
    """Corps envoyé à la veille. Le rattrapage seul accepte une source."""
    route, fixe = ACTIONS_VEILLE[action]
    if fixe is not None:
        return dict(fixe)
    corps: dict[str, Any] = {"reel": params.reel, "limite": params.limite}
    if action == "rattrapage-details":
        corps["source"] = params.source
    return corps


def _detail(reponse: httpx.Response) -> str:
    try:
        detail = reponse.json().get("detail")
    except ValueError:
        detail = None
    return detail if isinstance(detail, str) and detail else f"HTTP {reponse.status_code}"


async def journaliser(
    admin: UserPublic, action: str, params: dict[str, Any], statut: str,
    task_id: str | None = None, resultat: dict[str, Any] | None = None,
    module: str = MODULE_VEILLE,
) -> str:
    ligne = AdminAction(
        id=str(uuid.uuid4()), created_at=_maintenant(),
        termine_at=_maintenant() if statut != "lance" else None,
        admin_user_id=admin.id, admin_email=admin.email,
        module=module, action=action, params=params,
        task_id=task_id, statut=statut, resultat=resultat,
    )
    async with AsyncSessionLocal() as db:
        db.add(ligne)
        await db.commit()
    return ligne.id


def _configuration(settings: Settings) -> tuple[str, dict[str, str]]:
    if not settings.watcher_service_url or not settings.watcher_admin_secret:
        raise ActionErreur(
            503,
            "Les actions sur la veille ne sont pas configurées "
            "(WATCHER_SERVICE_URL et WATCHER_ADMIN_SECRET).",
        )
    return settings.watcher_service_url.rstrip("/"), {"X-Admin-Secret": settings.watcher_admin_secret}


async def lancer_action_veille(
    admin: UserPublic, action: str, params: ActionVeilleIn, settings: Settings,
) -> ActionLancee:
    if action not in ACTIONS_VEILLE:
        raise ActionErreur(404, "Action inconnue.")
    base, entetes = _configuration(settings)
    corps = corps_action(action, params)
    route = ACTIONS_VEILLE[action][0]

    try:
        async with httpx.AsyncClient(timeout=_DELAI_SECONDES) as client:
            reponse = await client.post(f"{base}{route}", json=corps, headers=entetes)
    except httpx.HTTPError as exc:
        logger.warning("Veille injoignable  action=%s erreur=%s", action, exc)
        await journaliser(admin, action, corps, "echec", resultat={"erreur": "Veille injoignable."})
        raise ActionErreur(503, "La veille ne répond pas. Réessayez dans un instant.")

    if reponse.status_code == 409:
        detail = _detail(reponse)
        await journaliser(admin, action, corps, "refuse", resultat={"raison": detail})
        raise ActionErreur(409, "Cette action est déjà en cours : attendez sa fin, visible dans le journal.")
    if reponse.status_code == 403:
        await journaliser(admin, action, corps, "echec", resultat={"erreur": "Secret refusé par la veille."})
        raise ActionErreur(
            502, "La veille a refusé le secret : WATCHER_ADMIN_SECRET diffère entre le backend et la veille.",
        )
    if reponse.status_code != 200:
        detail = _detail(reponse)
        await journaliser(admin, action, corps, "echec", resultat={"erreur": detail})
        raise ActionErreur(502, f"La veille a répondu une erreur : {detail}")

    task_id = reponse.json()["task_id"]
    journal_id = await journaliser(admin, action, corps, "lance", task_id=task_id)
    logger.info("Action d'administration lancée  admin=%s action=%s task=%s", admin.email, action, task_id)
    return ActionLancee(id=journal_id, action=action, task_id=task_id, params=corps)


async def etat_action(task_id: str, settings: Settings) -> EtatAction:
    """État d'une tâche de la veille ; la première lecture qui la voit
    terminée complète le journal."""
    base, entetes = _configuration(settings)
    try:
        async with httpx.AsyncClient(timeout=_DELAI_SECONDES) as client:
            reponse = await client.get(f"{base}/admin/taches/{task_id}", headers=entetes)
    except httpx.HTTPError:
        raise ActionErreur(503, "La veille ne répond pas. Réessayez dans un instant.")
    if reponse.status_code != 200:
        raise ActionErreur(502, f"La veille a répondu une erreur : {_detail(reponse)}")

    etat = EtatAction(**reponse.json())
    if etat.etat in _ETATS_FINAUX:
        resultat = etat.resultat if etat.etat == "termine" else {"erreur": etat.erreur}
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(AdminAction)
                .where(AdminAction.task_id == task_id, AdminAction.statut == "lance")
                .values(statut=_ETATS_FINAUX[etat.etat], termine_at=_maintenant(), resultat=resultat)
            )
            await db.commit()
    return etat


# Lignes « lancé » rafraîchies à chaque lecture du journal : sans cela, une
# tâche que personne n'a suivie jusqu'au bout (onglet fermé) restait « en
# cours » pour toujours.
MAX_RAFRAICHIS = 10


async def _rafraichir_en_cours(settings: Settings) -> None:
    async with AsyncSessionLocal() as db:
        task_ids = (await db.execute(
            select(AdminAction.task_id)
            .where(AdminAction.statut == "lance", AdminAction.task_id.isnot(None))
            .order_by(AdminAction.created_at.desc())
            .limit(MAX_RAFRAICHIS)
        )).scalars().all()
    for task_id in task_ids:
        try:
            await etat_action(task_id, settings)
        except ActionErreur:
            return  # veille injoignable : le journal s'affiche tel quel


async def journal(limite: int, settings: Settings | None = None) -> list[JournalAction]:
    if settings is not None and settings.watcher_service_url and settings.watcher_admin_secret:
        await _rafraichir_en_cours(settings)
    async with AsyncSessionLocal() as db:
        lignes = (await db.execute(
            select(AdminAction).order_by(AdminAction.created_at.desc()).limit(limite)
        )).scalars().all()
    return [
        JournalAction(
            id=l.id, created_at=l.created_at, termine_at=l.termine_at, admin_email=l.admin_email,
            module=l.module, action=l.action, params=l.params, task_id=l.task_id,
            statut=l.statut, resultat=l.resultat,
        )
        for l in lignes
    ]
