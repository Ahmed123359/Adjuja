import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.billing.plans import Plan, get_plan
from app.db.models import AppelOffre, CompanyDocument, Subscription, User

CounterName = Literal["ao_per_month", "documents"]


class PlanLimitExceeded(Exception):
    def __init__(self, counter: CounterName, limit: int) -> None:
        self.counter = counter
        self.limit = limit
        super().__init__(f"Limite du plan atteinte pour '{counter}' ({limit}).")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _month_start_iso() -> str:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()


class SubscriptionService:
    """Source de vérité unique pour l'accès aux fonctionnalités payantes.
    Tous les checks lisent la table `subscriptions`, jamais un appel live au
    provider de paiement -- voir api.md du feature-spec billing."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_row(self, org_id: str) -> Subscription | None:
        result = await self._db.execute(select(Subscription).where(Subscription.org_id == org_id))
        return result.scalar_one_or_none()

    async def get_plan(self, org_id: str) -> Plan:
        row = await self.get_row(org_id)
        return get_plan(row.plan_code if row else "free")

    async def check_limit(self, org_id: str, counter: CounterName) -> None:
        plan = await self.get_plan(org_id)

        if counter == "ao_per_month":
            limit = plan.max_ao_per_month
            if limit is None:
                return
            used = await self._count_ao_this_month(org_id)
        elif counter == "documents":
            limit = plan.max_documents
            if limit is None:
                return
            used = await self._count_documents(org_id)
        else:
            return

        if used >= limit:
            raise PlanLimitExceeded(counter, limit)

    async def check_seat_limit(self, org_id: str) -> None:
        """Prêt à être câblé quand un endpoint d'invitation d'équipe existera --
        voir Open Questions du feature-spec, non câblé nulle part aujourd'hui."""
        plan = await self.get_plan(org_id)
        if plan.max_users is None:
            return
        result = await self._db.execute(select(func.count()).select_from(User).where(User.org_id == org_id))
        used = result.scalar_one()
        if used >= plan.max_users:
            raise PlanLimitExceeded("users", plan.max_users)

    async def _count_ao_this_month(self, org_id: str) -> int:
        result = await self._db.execute(
            select(func.count()).select_from(AppelOffre).where(
                AppelOffre.org_id == org_id,
                AppelOffre.created_at >= _month_start_iso(),
            )
        )
        return result.scalar_one()

    async def _count_documents(self, org_id: str) -> int:
        result = await self._db.execute(
            select(func.count()).select_from(CompanyDocument).where(CompanyDocument.org_id == org_id)
        )
        return result.scalar_one()

    async def activate(
        self,
        org_id: str,
        plan_code: str,
        provider: str,
        provider_ref: str | None,
        period_end: str | None,
    ) -> None:
        """Active/renouvelle un abonnement et lève le plafond de génération
        rapide pour tous les users de l'org (User.max_generations=0), qui
        reste le mécanisme existant pour ce flux -- voir api.md."""
        now = _now_iso()
        await self._db.execute(
            pg_insert(Subscription)
            .values(
                id=str(uuid.uuid4()), org_id=org_id, plan_code=plan_code, status="active",
                current_period_end=period_end, provider=provider, provider_ref=provider_ref,
                grace_until=None, created_at=now, updated_at=now,
            )
            .on_conflict_do_update(
                index_elements=["org_id"],
                set_={
                    "plan_code": plan_code, "status": "active", "current_period_end": period_end,
                    "provider": provider, "provider_ref": provider_ref, "grace_until": None,
                    "updated_at": now,
                },
            )
        )
        await self._db.execute(update(User).where(User.org_id == org_id).values(max_generations=0))
        await self._db.commit()

    async def mark_past_due(self, org_id: str, grace_days: int) -> None:
        grace_until = (datetime.now(timezone.utc) + timedelta(days=grace_days)).isoformat()
        await self._db.execute(
            update(Subscription).where(Subscription.org_id == org_id).values(
                status="past_due", grace_until=grace_until, updated_at=_now_iso(),
            )
        )
        await self._db.commit()

    async def downgrade_to_free(self, org_id: str) -> None:
        await self._db.execute(
            update(Subscription).where(Subscription.org_id == org_id).values(
                plan_code="free", status="canceled", updated_at=_now_iso(),
            )
        )
        await self._db.commit()

    async def expired_active_subscriptions(self) -> list[Subscription]:
        result = await self._db.execute(
            select(Subscription).where(
                Subscription.status == "active",
                Subscription.current_period_end.is_not(None),
                Subscription.current_period_end < _now_iso(),
            )
        )
        return list(result.scalars().all())

    async def get_usage_summary(self, org_id: str) -> dict:
        plan = await self.get_plan(org_id)
        ao_used = await self._count_ao_this_month(org_id)
        docs_used = await self._count_documents(org_id)
        return {
            "ao_per_month": {"used": ao_used, "limit": plan.max_ao_per_month},
            "documents": {"used": docs_used, "limit": plan.max_documents},
        }

    async def past_due_grace_expired(self) -> list[Subscription]:
        result = await self._db.execute(
            select(Subscription).where(
                Subscription.status == "past_due",
                Subscription.grace_until.is_not(None),
                Subscription.grace_until < _now_iso(),
            )
        )
        return list(result.scalars().all())
