"""
Sweep quotidien (Celery Beat) : fait passer les abonnements expirés en 'past_due'
avec période de grâce, puis downgrade vers 'free' une fois la grâce écoulée.

Aucun appel live au provider de paiement ici -- tout part de l'état déjà en DB
(`Subscription.current_period_end`/`grace_until`), voir
context/feature-specs/01-billing-subscriptions/api.md.
"""
import asyncio
import logging

import httpx
from celery import shared_task

from app.config.settings import get_settings

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Même pattern que `app/tasks/ao_tasks.py::_run_async` -- un event loop dédié
    par exécution de tâche, contexte worker Celery synchrone."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        try:
            from app.db.base import engine
            loop.run_until_complete(engine.dispose())
        except Exception:
            pass
        loop.close()
        asyncio.set_event_loop(None)


def _send_dunning_email(org_id: str, to_email: str, days_left: int) -> None:
    """POST vers notification-service, même pattern non-bloquant/échec-silencieux
    que `_trigger_notification_batch` dans ao-watcher/app/workers/tasks/scrape_tasks.py."""
    settings = get_settings()
    if not settings.notification_service_url:
        logger.warning("NOTIFICATION_SERVICE_URL non configuré, email de relance non envoyé org=%s", org_id)
        return

    subject = "Votre abonnement ADJUJA a expiré"
    html = (
        f"<p>Votre abonnement ADJUJA est arrivé à échéance. Vous avez encore "
        f"<strong>{days_left} jour(s)</strong> avant que votre compte repasse en accès limité.</p>"
        f"<p>Renouvelez dès maintenant pour conserver l'accès à toutes les fonctionnalités.</p>"
    )
    text = (
        f"Votre abonnement ADJUJA est arrivé à échéance. Vous avez encore {days_left} jour(s) "
        "avant que votre compte repasse en accès limité. Renouvelez dès maintenant."
    )

    try:
        resp = httpx.post(
            f"{settings.notification_service_url}/admin/send-transactional",
            headers={"X-Admin-Secret": settings.notification_admin_secret},
            json={"to_email": to_email, "subject": subject, "html": html, "text": text},
            timeout=5.0,
        )
        if resp.status_code != 200:
            logger.warning("Email de relance non envoyé org=%s status=%s", org_id, resp.status_code)
    except httpx.TimeoutException:
        logger.warning("notification-service injoignable (timeout), email de relance non envoyé org=%s", org_id)
    except Exception as exc:
        logger.warning("Échec envoi email de relance org=%s erreur=%s", org_id, exc)


@shared_task(name="app.tasks.billing_tasks.sweep_subscriptions")
def sweep_subscriptions() -> dict:
    return _run_async(_sweep())


async def _sweep() -> dict:
    from sqlalchemy import select

    from app.config.settings import get_settings
    from app.db.base import AsyncSessionLocal
    from app.db.models import User
    from app.services.subscription_service import SubscriptionService

    settings = get_settings()
    marked_past_due = 0
    downgraded = 0

    async with AsyncSessionLocal() as session:
        subs = SubscriptionService(session)

        for row in await subs.expired_active_subscriptions():
            await subs.mark_past_due(row.org_id, settings.billing_dunning_grace_days)
            marked_past_due += 1

            result = await session.execute(select(User).where(User.org_id == row.org_id))
            for user in result.scalars().all():
                _send_dunning_email(row.org_id, user.email, settings.billing_dunning_grace_days)

        for row in await subs.past_due_grace_expired():
            await subs.downgrade_to_free(row.org_id)
            downgraded += 1

    logger.info("Sweep billing terminé: past_due=%d downgraded=%d", marked_past_due, downgraded)
    return {"marked_past_due": marked_past_due, "downgraded": downgraded}
