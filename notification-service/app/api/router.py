from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text

from app.core.config import settings
from app.core.database import get_session
from app.core.models import NotificationPreference

router = APIRouter()


# ── Auth helpers ─────────────────────────────────────────────────────────────

def _require_admin(x_admin_secret: str = Header(..., alias="X-Admin-Secret")) -> None:
    if x_admin_secret != settings.admin_secret:
        raise HTTPException(status_code=403, detail="Accès refusé.")


def _require_jwt(authorization: str = Header(...)) -> str:
    """Extrait le org_id du JWT. Validation minimale : présence du header."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token manquant.")
    return authorization  # relayé tel quel  la validation complète est côté app principale


# ── Schemas ──────────────────────────────────────────────────────────────────

class PreferenceIn(BaseModel):
    enabled: bool = True
    secteur_codes: list[str] = []
    notify_bdc: bool = False


class PreferenceOut(BaseModel):
    org_id: str
    enabled: bool
    secteur_codes: list[str]
    notify_bdc: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Preferences CRUD ─────────────────────────────────────────────────────────

@router.get("/preferences/{org_id}", response_model=PreferenceOut)
def get_preferences(org_id: str, _auth: str = Depends(_require_jwt)):
    with get_session() as session:
        pref = session.execute(
            text("SELECT * FROM notifications.notification_preferences WHERE org_id = :id"),
            {"id": org_id},
        ).fetchone()
    if not pref:
        raise HTTPException(status_code=404, detail="Aucune préférence pour cet org.")
    return PreferenceOut(
        org_id=pref.org_id,
        enabled=pref.enabled,
        secteur_codes=pref.secteur_codes or [],
        notify_bdc=pref.notify_bdc,
        created_at=pref.created_at,
        updated_at=pref.updated_at,
    )


@router.put("/preferences/{org_id}", response_model=PreferenceOut)
def upsert_preferences(org_id: str, body: PreferenceIn, _auth: str = Depends(_require_jwt)):
    now = datetime.now(timezone.utc)
    with get_session() as session:
        session.execute(
            text("""
                INSERT INTO notifications.notification_preferences
                    (org_id, enabled, secteur_codes, notify_bdc, created_at, updated_at)
                VALUES (:org_id, :enabled, CAST(:codes AS jsonb), :notify_bdc, :now, :now)
                ON CONFLICT (org_id) DO UPDATE
                SET enabled       = EXCLUDED.enabled,
                    secteur_codes = EXCLUDED.secteur_codes,
                    notify_bdc    = EXCLUDED.notify_bdc,
                    updated_at    = EXCLUDED.updated_at
            """),
            {
                "org_id": org_id,
                "enabled": body.enabled,
                "codes": str(body.secteur_codes).replace("'", '"'),
                "notify_bdc": body.notify_bdc,
                "now": now,
            },
        )
        session.commit()

        pref = session.execute(
            text("SELECT * FROM notifications.notification_preferences WHERE org_id = :id"),
            {"id": org_id},
        ).fetchone()

    return PreferenceOut(
        org_id=pref.org_id,
        enabled=pref.enabled,
        secteur_codes=pref.secteur_codes or [],
        notify_bdc=pref.notify_bdc,
        created_at=pref.created_at,
        updated_at=pref.updated_at,
    )


@router.delete("/preferences/{org_id}", status_code=204)
def disable_preferences(org_id: str, _auth: str = Depends(_require_jwt)):
    with get_session() as session:
        session.execute(
            text("""
                UPDATE notifications.notification_preferences
                SET enabled = FALSE, updated_at = NOW()
                WHERE org_id = :id
            """),
            {"id": org_id},
        )
        session.commit()


# ── Admin ─────────────────────────────────────────────────────────────────────

@router.post("/admin/trigger", dependencies=[Depends(_require_admin)])
def trigger_batch():
    from app.workers.tasks.batch_tasks import run_notification_batch
    task = run_notification_batch.delay()
    return {"task_id": task.id, "status": "queued"}


@router.get("/admin/batches", dependencies=[Depends(_require_admin)])
def list_batches(limit: int = Query(20, ge=1, le=100)):
    with get_session() as session:
        rows = session.execute(
            text("""
                SELECT id, started_at, finished_at, orgs_processed,
                       emails_sent, orgs_skipped, status
                FROM notifications.notification_batches
                ORDER BY started_at DESC
                LIMIT :limit
            """),
            {"limit": limit},
        ).fetchall()
    return [row._mapping for row in rows]


@router.get("/admin/log", dependencies=[Depends(_require_admin)])
def get_log(
    org_id: str | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
):
    where = "WHERE nl.org_id = :org_id" if org_id else ""
    with get_session() as session:
        rows = session.execute(
            text(f"""
                SELECT nl.id, nl.org_id, nl.ao_id, nl.batch_id, nl.channel, nl.sent_at,
                       sa.titre, sa.acheteur
                FROM notifications.notification_log nl
                LEFT JOIN watcher.scraped_aos sa ON sa.id = nl.ao_id
                {where}
                ORDER BY nl.sent_at DESC
                LIMIT :limit
            """),
            {"org_id": org_id, "limit": limit},
        ).fetchall()
    return [row._mapping for row in rows]
