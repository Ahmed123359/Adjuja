"""
Initialisation idempotente du schema notifications.
Exécuter une fois après le premier déploiement :
  docker compose -f docker-compose.dev.yml run --rm notification-api python init_db.py
"""

from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.database import Base

engine = create_engine(
    settings.database_url.replace("+asyncpg", ""),
    poolclass=NullPool,
)

with engine.connect() as conn:
    conn.execute(text("CREATE SCHEMA IF NOT EXISTS notifications"))
    conn.commit()

Base.metadata.create_all(engine, checkfirst=True)

print("Schema 'notifications' initialisé.")
