"""Organisation d'un utilisateur seul : première invitation et activation d'offre.

Base réelle (migrations appliquées, comme en CI). Deux défauts du 2026-09-30
(context/bugs-connus.md) :
- la première invitation créait une organisation d'id neuf, et le propriétaire
  perdait la vue sur ses dossiers rangés sous son id ;
- activer une offre pour un utilisateur seul violait la clé étrangère
  subscriptions.org_id -> organizations.id.
"""

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import delete, select

from app.db.base import AsyncSessionLocal, engine
from app.db.models import AppelOffre, Organization, Subscription, User
from app.models.user import UserPublic
from app.services.subscription_service import SubscriptionService
from app.services.user_service import UserService


def _maintenant() -> str:
    return datetime.now(timezone.utc).isoformat()


@pytest.fixture(autouse=True)
async def _fermer_pool():
    yield
    await engine.dispose()


@pytest.fixture
async def solo() -> UserPublic:
    uid = str(uuid.uuid4())
    async with AsyncSessionLocal() as db:
        db.add(User(
            id=uid, org_id=None, nom="Seul", prenom="Test", email=f"solo-{uid[:8]}@exemple.ma",
            hashed_pwd="x", created_at=_maintenant(), email_verified=True, max_generations=1,
        ))
        await db.commit()  # l'utilisateur d'abord : le dossier le référence
        # Un dossier créé avant toute organisation : rangé sous l'id de l'utilisateur.
        db.add(AppelOffre(
            id=str(uuid.uuid4()), org_id=uid, user_id=uid, created_at=_maintenant(),
            updated_at=_maintenant(), objet="Dossier d'avant l'invitation",
        ))
        await db.commit()
    yield UserPublic(id=uid, nom="Seul", prenom="Test", email=f"solo-{uid[:8]}@exemple.ma",
                     created_at=_maintenant())
    async with AsyncSessionLocal() as db:
        await db.execute(delete(Subscription).where(Subscription.org_id == uid))
        await db.execute(delete(AppelOffre).where(AppelOffre.user_id == uid))
        await db.execute(User.__table__.update().where(User.id == uid).values(org_id=None))
        await db.execute(delete(Organization).where(Organization.id == uid))
        await db.execute(delete(User).where(User.id == uid))
        await db.commit()


async def test_premiere_invitation_garde_les_dossiers(solo: UserPublic) -> None:
    async with AsyncSessionLocal() as db:
        org_id = await UserService(db).ensure_own_org(solo)
    assert org_id == solo.id
    async with AsyncSessionLocal() as db:
        # La lecture habituelle (`org_id or id`) retrouve le dossier d'avant.
        user = await db.get(User, solo.id)
        dossiers = (await db.execute(
            select(AppelOffre).where(AppelOffre.org_id == (user.org_id or user.id))
        )).scalars().all()
    assert user.org_id == solo.id
    assert [d.objet for d in dossiers] == ["Dossier d'avant l'invitation"]


async def test_activation_offre_utilisateur_seul(solo: UserPublic) -> None:
    async with AsyncSessionLocal() as db:
        await SubscriptionService(db).activate(solo.id, "pro", provider="manual", provider_ref=None, period_end=None)
    async with AsyncSessionLocal() as db:
        sub = (await db.execute(select(Subscription).where(Subscription.org_id == solo.id))).scalar_one()
        user = await db.get(User, solo.id)
        org = await db.get(Organization, solo.id)
    assert (sub.plan_code, sub.status) == ("pro", "active")
    assert org is not None and org.owner_id == solo.id
    # Le plafond de génération est levé pour lui aussi.
    assert user.org_id == solo.id and user.max_generations == 0
