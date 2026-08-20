import logging
from datetime import date, datetime, timedelta, timezone

from celery import chord, group
from sqlalchemy import text

from app.channels.factory import NotificationChannelFactory
from app.core.config import settings
from app.core.database import get_session
from app.core.models import NotificationBatch, NotificationLog
from app.services.recipients import resolve_org_email
from app.templates.ao_digest import AoItem
from app.templates.registry import TemplateRegistry
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


def _cadence_days(cadence_unit: str, cadence_value: int) -> int:
    if cadence_unit == "week":
        return cadence_value * 7
    if cadence_unit == "month":
        return cadence_value * 30
    return cadence_value


@celery_app.task(name="app.workers.tasks.batch_tasks.run_notification_batch")
def run_notification_batch() -> dict:
    """
    Tick horaire : lit les orgs dont l'heure d'envoi configurée correspond à
    l'heure courante ET dont la cadence est due (jamais notifiée, ou dernier
    envoi assez ancien), et lance un chord : group(notify_org * N) -> finalize_batch.
    """
    with get_session() as session:
        batch = NotificationBatch()
        session.add(batch)
        session.commit()
        session.refresh(batch)
        batch_id = batch.id

        rows = session.execute(
            text("""
                SELECT org_id, secteur_codes, max_items, cadence_unit, cadence_value, last_notified_at
                FROM notifications.notification_preferences
                WHERE enabled = TRUE
                  AND jsonb_array_length(secteur_codes) > 0
                  AND send_hour = EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Africa/Casablanca')
                  AND (
                    last_notified_at IS NULL
                    OR NOW() - last_notified_at >= make_interval(days =>
                         CASE cadence_unit
                           WHEN 'week'  THEN cadence_value * 7
                           WHEN 'month' THEN cadence_value * 30
                           ELSE cadence_value
                         END
                       )
                  )
            """)
        ).fetchall()

    if not rows:
        logger.info("Batch %d : aucune org due pour cette heure.", batch_id)
        _mark_batch_done(batch_id, orgs_processed=0, emails_sent=0, orgs_skipped=0)
        return {"batch_id": batch_id, "orgs": 0}

    logger.info("Batch %d : %d org(s) due(s).", batch_id, len(rows))

    now = datetime.now(timezone.utc)
    tasks = group(
        notify_org.s(
            str(row.org_id),
            list(row.secteur_codes),
            batch_id,
            row.max_items,
            (row.last_notified_at or (now - timedelta(days=_cadence_days(row.cadence_unit, row.cadence_value)))).isoformat(),
        )
        for row in rows
    )
    chord(tasks)(finalize_batch.s(batch_id))

    # Abonnés newsletter en parallèle (indépendant du chord)
    notify_newsletter_subscribers.delay(batch_id)

    return {"batch_id": batch_id, "orgs": len(rows)}


@celery_app.task(
    name="app.workers.tasks.batch_tasks.notify_org",
    autoretry_for=(Exception,),
    max_retries=2,
    default_retry_delay=60,
)
def notify_org(
    org_id: str,
    secteur_codes: list[str],
    batch_id: int,
    max_items: int,
    since: str,
) -> dict:
    """
    Traitement d'une org : find new AOs -> build email -> send -> log.
    """
    with get_session() as session:
        # 1. Fetch new matching AOs not yet in notification_log for this org
        # `?|` (jsonb array contains any of these text keys) is the correct
        # overlap check here -- `&&` is an array operator, not a jsonb one, it
        # does not exist for jsonb and errors at execution time. Never hit in
        # prod until now because no org ever had active preferences with
        # secteur_codes set.
        aos_rows = session.execute(
            text("""
                SELECT sa.id,
                       sa.titre,
                       sa.acheteur,
                       sa.categorie,
                       sa.date_limite,
                       sa.url_source,
                       sa.external_id
                FROM watcher.scraped_aos sa
                WHERE sa.secteur_codes IS NOT NULL
                  AND sa.secteur_codes ?| :codes
                  AND sa.date_publication >= :since
                  AND NOT EXISTS (
                      SELECT 1 FROM notifications.notification_log nl
                      WHERE nl.org_id = :org_id AND nl.ao_id = sa.id
                  )
                ORDER BY sa.date_publication DESC
                LIMIT :max_items
            """),
            {"codes": secteur_codes, "org_id": org_id, "since": since, "max_items": max_items},
        ).fetchall()

        if not aos_rows:
            return {"org_id": org_id, "sent": False, "reason": "no_new_aos"}

        # 2. Get org email
        recipient = resolve_org_email(session, org_id)
        if not recipient:
            logger.warning("Org %s : aucun email trouvé, skip.", org_id)
            return {"org_id": org_id, "sent": False, "reason": "no_email"}

        # 3. Build email content
        ao_items = [
            AoItem(
                titre=row.titre,
                acheteur=row.acheteur,
                categorie=row.categorie,
                date_limite=row.date_limite,
                url_source=row.url_source,
                reference=row.external_id,
            )
            for row in aos_rows
        ]

        content = TemplateRegistry.get("ao_digest").render({"aos": ao_items})

        # 4. Send
        channel = NotificationChannelFactory.create(settings.notification_channel)
        sent = channel.send(recipient, content)

        if not sent:
            return {"org_id": org_id, "sent": False, "reason": "send_failed"}

        # 5. Log  ON CONFLICT DO NOTHING guarantees no duplicate per (org, ao)
        for row in aos_rows:
            session.execute(
                text("""
                    INSERT INTO notifications.notification_log
                        (org_id, ao_id, batch_id, channel)
                    VALUES (:org_id, :ao_id, :batch_id, :channel)
                    ON CONFLICT (org_id, ao_id) DO NOTHING
                """),
                {
                    "org_id": org_id,
                    "ao_id": row.id,
                    "batch_id": batch_id,
                    "channel": channel.channel_type,
                },
            )

        # 6. Cooldown : seul un envoi réussi fait avancer last_notified_at,
        # sinon une org sans nouveauté resterait éligible au prochain tick
        # au lieu d'être repoussée d'une cadence entière pour rien.
        session.execute(
            text("""
                UPDATE notifications.notification_preferences
                SET last_notified_at = NOW()
                WHERE org_id = :org_id
            """),
            {"org_id": org_id},
        )
        session.commit()

    logger.info("Org %s : %d AO(s) notifiés à %s.", org_id, len(aos_rows), recipient)
    return {"org_id": org_id, "sent": True, "ao_count": len(aos_rows)}


@celery_app.task(name="app.workers.tasks.batch_tasks.finalize_batch")
def finalize_batch(results: list[dict], batch_id: int) -> dict:
    """Chord callback : agrège les résultats et marque le batch terminé."""
    emails_sent = sum(1 for r in results if r.get("sent"))
    orgs_skipped = sum(1 for r in results if not r.get("sent"))

    _mark_batch_done(
        batch_id,
        orgs_processed=len(results),
        emails_sent=emails_sent,
        orgs_skipped=orgs_skipped,
    )

    logger.info(
        "Batch %d terminé : %d emails envoyés, %d orgs skippées.",
        batch_id, emails_sent, orgs_skipped,
    )
    return {"batch_id": batch_id, "emails_sent": emails_sent, "orgs_skipped": orgs_skipped}


@celery_app.task(
    name="app.workers.tasks.batch_tasks.notify_newsletter_subscribers",
    autoretry_for=(Exception,),
    max_retries=2,
    default_retry_delay=60,
)
def notify_newsletter_subscribers(batch_id: int) -> dict:
    """Envoie un digest des AOs récents à tous les abonnés newsletter actifs."""
    with get_session() as session:
        rows = session.execute(
            text("""
                SELECT sa.id, sa.titre, sa.acheteur, sa.categorie,
                       sa.date_limite, sa.url_source
                FROM watcher.scraped_aos sa
                WHERE sa.date_publication >= NOW() - INTERVAL '24 hours'
                ORDER BY sa.date_publication DESC
                LIMIT 20
            """)
        ).fetchall()

        if not rows:
            return {"newsletter": True, "sent": 0, "reason": "no_new_aos"}

        subscribers = session.execute(
            text("SELECT email FROM public.newsletter_subscribers WHERE active = TRUE")
        ).fetchall()

        if not subscribers:
            return {"newsletter": True, "sent": 0, "reason": "no_subscribers"}

        ao_items = [
            AoItem(
                titre=r.titre,
                acheteur=r.acheteur,
                categorie=r.categorie,
                date_limite=r.date_limite,
                url_source=r.url_source,
            )
            for r in rows
        ]
        content = TemplateRegistry.get("ao_digest").render({"aos": ao_items})
        channel = NotificationChannelFactory.create(settings.notification_channel)

        sent = 0
        for sub in subscribers:
            if channel.send(sub.email, content):
                sent += 1

    logger.info("Newsletter : %d emails envoyés.", sent)
    return {"newsletter": True, "sent": sent}


def _mark_batch_done(
    batch_id: int,
    *,
    orgs_processed: int,
    emails_sent: int,
    orgs_skipped: int,
    status: str = "completed",
) -> None:
    with get_session() as session:
        session.execute(
            text("""
                UPDATE notifications.notification_batches
                SET finished_at     = :now,
                    orgs_processed  = :orgs_processed,
                    emails_sent     = :emails_sent,
                    orgs_skipped    = :orgs_skipped,
                    status          = :status
                WHERE id = :batch_id
            """),
            {
                "now": datetime.now(timezone.utc),
                "orgs_processed": orgs_processed,
                "emails_sent": emails_sent,
                "orgs_skipped": orgs_skipped,
                "status": status,
                "batch_id": batch_id,
            },
        )
        session.commit()
