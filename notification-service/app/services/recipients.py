from sqlalchemy import text
from sqlalchemy.orm import Session


def resolve_org_email(session: Session, org_id: str) -> str | None:
    """Email de contact d'une org : profil entreprise, sinon premier utilisateur de l'org."""
    email_row = session.execute(
        text("""
            SELECT email FROM public.company_profiles
            WHERE org_id = :org_id AND email != ''
            LIMIT 1
        """),
        {"org_id": org_id},
    ).fetchone()

    if not email_row:
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

    return email_row.email if email_row else None
