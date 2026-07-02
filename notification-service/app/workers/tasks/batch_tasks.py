import logging
from datetime import date, datetime, timezone

from celery import chord, group
from sqlalchemy import text

from app.channels.factory import NotificationChannelFactory
from app.core.config import settings
from app.core.database import get_session
from app.core.models import NotificationBatch, NotificationLog
from app.templates.ao_digest import AoItem
from app.templates.registry import TemplateRegistry
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.workers.tasks.batch_tasks.run_notification_batch")
def run_notification_batch() -> dict:
    """
    Point d'entrée du batch quotidien.
    Lit toutes les orgs avec des préférences actives et lance un chord :
      group(notify_org * N) -> finalize_batch
    """
    with get_session() as session:
        batch = NotificationBatch()
        session.add(batch)
        session.commit()
        session.refresh(batch)
        batch_id = batch.id

        rows = session.execute(
            text("""
                SELECT org_id, secteur_codes
                FROM notifications.notification_preferences
                WHERE enabled = TRUE
                  AND jsonb_array_length(secteur_codes) > 0
            """)
        ).fetchall()

    if not rows:
        logger.info("Batch %d : aucune org avec préférences actives.", batch_id)
        _mark_batch_done(batch_id, orgs_processed=0, emails_sent=0, orgs_skipped=0)
        return {"batch_id": batch_id, "orgs": 0}

    logger.info("Batch %d : %d org(s) à notifier.", batch_id, len(rows))

    tasks = group(
        notify_org.s(str(row.org_id), list(row.secteur_codes), batch_id)
        for row in rows
    )
    chord(tasks)(finalize_batch.s(batch_id))

    return {"batch_id": batch_id, "orgs": len(rows)}


@celery_app.task(
    name="app.workers.tasks.batch_tasks.notify_org",
    autoretry_for=(Exception,),
    max_retries=2,
    default_retry_delay=60,
)
def notify_org(org_id: str, secteur_codes: list[str], batch_id: int) -> dict:
    """
    Traitement d'une org : find new AOs -> build email -> send -> log.
    """
    with get_session() as session:
        # 1. Fetch new matching AOs not yet in notification_log for this org
        codes_json = "[" + ",".join('"' + c + '"' for c in secteur_codes) + "]"
        aos_rows = session.execute(
            text("""
                SELECT sa.id,
                       sa.titre,
                       sa.acheteur,
                       sa.categorie,
                       sa.date_limite,
                       sa.url_source
                FROM watcher.scraped_aos sa
                WHERE sa.secteur_codes IS NOT NULL
                  AND sa.secteur_codes && CAST(:codes AS jsonb)
                  AND sa.date_publication >= NOW() - INTERVAL '24 hours'
                  AND NOT EXISTS (
                      SELECT 1 FROM notifications.notification_log nl
                      WHERE nl.org_id = :org_id AND nl.ao_id = sa.id
                  )
                ORDER BY sa.date_publication DESC
                LIMIT 50
            """),
            {"codes": codes_json, "org_id": org_id},
        ).fetchall()

        if not aos_rows:
            return {"org_id": org_id, "sent": False, "reason": "no_new_aos"}

        # 2. Get org email
        email_row = session.execute(
            text("""
                SELECT email FROM public.company_profiles
                WHERE org_id = :org_id AND email != ''
                LIMIT 1
            """),
            {"org_id": org_id},
        ).fetchone()

        if not email_row:
            # Fallback : premier utilisateur de l'org
            email_row = session.execute(
                text("""
                    SELECT email FROM public.users
                    WHERE (org_id = :org_id OR id = :org_id)
                      AND email != ''
                    ORDER BY created_at ASC
                    LIMIT 1
                """),
                {"org_id": org_id},
            ).fetchone()

        if not email_row:
            logger.warning("Org %s : aucun email trouvé, skip.", org_id)
            return {"org_id": org_id, "sent": False, "reason": "no_email"}

        recipient = email_row.email

        # 3. Build email content
        ao_items = [
            AoItem(
                titre=row.titre,
                acheteur=row.acheteur,
                categorie=row.categorie,
                date_limite=row.date_limite,
                url_source=row.url_source,
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
