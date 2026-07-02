import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
from app.limiter import limiter
from fastapi import Request

router = APIRouter(prefix="/api/v1/newsletter", tags=["Newsletter"])


class SubscribeIn(BaseModel):
    email: EmailStr


@router.post("/subscribe", status_code=201)
@limiter.limit("5/minute")
async def subscribe(request: Request, body: SubscribeIn, db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc).isoformat()
    try:
        await db.execute(
            text("""
                INSERT INTO newsletter_subscribers (id, email, active, created_at)
                VALUES (:id, :email, TRUE, :now)
                ON CONFLICT (email) DO UPDATE SET active = TRUE
            """),
            {"id": str(uuid.uuid4()), "email": body.email, "now": now},
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Erreur lors de l'inscription.")
    return {"message": "Inscription confirmée."}


@router.delete("/unsubscribe")
async def unsubscribe(email: str, db: AsyncSession = Depends(get_db)):
    await db.execute(
        text("UPDATE newsletter_subscribers SET active = FALSE WHERE email = :email"),
        {"email": email},
    )
    await db.commit()
    return {"message": "Désinscription effectuée."}
