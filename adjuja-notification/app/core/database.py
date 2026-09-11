from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session
from sqlalchemy.pool import NullPool

from app.core.config import settings


class Base(DeclarativeBase):
    pass


def get_engine():
    """NullPool per task: each Celery task gets its own connection, no sharing."""
    return create_engine(
        settings.database_url.replace("+asyncpg", ""),
        poolclass=NullPool,
    )


def get_session() -> Session:
    engine = get_engine()
    return Session(engine)


def ensure_schema(session: Session) -> None:
    session.execute(text("CREATE SCHEMA IF NOT EXISTS notifications"))
    session.commit()
