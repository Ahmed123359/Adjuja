import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db, get_subscription_service, require_billing_admin
from app.billing.plans import PLANS, SELF_SERVE_PLAN_CODES
from app.billing.provider.factory import PaymentProviderFactory
from app.db.models import BillingEvent
from app.models.user import UserPublic
from app.services.subscription_service import SubscriptionService

router = APIRouter(prefix="/billing", tags=["Billing"])
logger = logging.getLogger(__name__)


class CheckoutRequest(BaseModel):
    plan_code: str


class CheckoutResponse(BaseModel):
    redirect_url: str


class AdminActivateRequest(BaseModel):
    org_id: str
    plan_code: str
    period_end: str | None = None


@router.get("/plans")
def list_plans() -> dict:
    """Public. Expose les plans/limites réelles, pour que la page pricing puisse
    un jour lire ces chiffres au lieu de les dupliquer en dur côté frontend."""
    return {code: vars(plan) for code, plan in PLANS.items()}


@router.get("/subscription")
async def get_subscription(
    current_user: UserPublic = Depends(get_current_user),
    subs: SubscriptionService = Depends(get_subscription_service),
) -> dict:
    org_id = current_user.org_id or current_user.id
    row = await subs.get_row(org_id)
    plan = await subs.get_plan(org_id)
    usage = await subs.get_usage_summary(org_id)
    return {
        "plan_code": plan.code,
        "status": row.status if row else "active",
        "current_period_end": row.current_period_end if row else None,
        "usage": usage,
    }


@router.post("/checkout", response_model=CheckoutResponse)
async def start_checkout(
    body: CheckoutRequest,
    current_user: UserPublic = Depends(get_current_user),
) -> CheckoutResponse:
    if body.plan_code not in SELF_SERVE_PLAN_CODES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Le plan '{body.plan_code}' n'est pas disponible en self-serve. Contactez l'équipe.",
        )

    org_id = current_user.org_id or current_user.id
    provider = PaymentProviderFactory.create("cmi")
    try:
        session = await provider.create_checkout(org_id, body.plan_code)
    except Exception as e:
        logger.error("Checkout CMI impossible org=%s plan=%s erreur=%s", org_id, body.plan_code, e)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))

    return CheckoutResponse(redirect_url=session.redirect_url)


@router.post("/webhook/cmi", include_in_schema=False)
async def cmi_webhook(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    raw_body = await request.body()
    provider = PaymentProviderFactory.create("cmi")
    event = provider.parse_webhook(dict(request.headers), raw_body)
    if event is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Signature invalide.")

    existing = await db.execute(
        select(BillingEvent).where(
            BillingEvent.provider == "cmi",
            BillingEvent.provider_event_id == event.provider_event_id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        # Déjà traité : CMI a rejoué le callback. On répond 200 sans réactiver.
        return {"status": "already_processed"}

    now = datetime.now(timezone.utc).isoformat()
    db.add(BillingEvent(
        id=str(uuid.uuid4()), provider="cmi", provider_event_id=event.provider_event_id,
        org_id=event.org_id, event_type=event.event_type,
        raw_payload=str(event.raw), processed_at=now,
    ))
    await db.commit()

    if event.event_type == "payment_succeeded":
        period_end = event.period_end or (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        subs = SubscriptionService(db)
        await subs.activate(event.org_id, event.plan_code, provider="cmi", provider_ref=event.provider_event_id, period_end=period_end)
        logger.info("Abonnement activé via CMI org=%s plan=%s", event.org_id, event.plan_code)
    else:
        logger.warning("Paiement CMI échoué org=%s", event.org_id)

    return {"status": "ok"}


@router.post("/admin/activate", dependencies=[Depends(require_billing_admin)])
async def admin_activate(
    body: AdminActivateRequest,
    subs: SubscriptionService = Depends(get_subscription_service),
) -> dict:
    """Activation manuelle Pro/Enterprise (virement bancaire + facture, pas de CMI)."""
    if body.plan_code not in PLANS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Plan '{body.plan_code}' inconnu.")

    period_end = body.period_end or (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
    await subs.activate(body.org_id, body.plan_code, provider="manual", provider_ref=None, period_end=period_end)
    logger.info("Abonnement activé manuellement org=%s plan=%s", body.org_id, body.plan_code)
    return {"status": "ok", "org_id": body.org_id, "plan_code": body.plan_code, "period_end": period_end}
