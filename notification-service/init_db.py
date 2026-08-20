"""
Initialisation idempotente du schema notifications.
Exécuter une fois après le premier déploiement :
  docker compose -f docker-compose.dev.yml run --rm notification-api python init_db.py

Base.metadata.create_all(checkfirst=True) crée les tables manquantes mais ne fait
JAMAIS d'ALTER TABLE sur une table déjà existante. Après l'ajout des colonnes
cadence_unit/cadence_value/send_hour/max_items/last_notified_at sur
NotificationPreference (préférences de notification, feature cadence + secteurs
indépendants), exécuter une fois par environnement (dev + prod) :

  ALTER TABLE notifications.notification_preferences
    ADD COLUMN IF NOT EXISTS cadence_unit      VARCHAR(10) NOT NULL DEFAULT 'day',
    ADD COLUMN IF NOT EXISTS cadence_value     INTEGER     NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS send_hour         INTEGER     NOT NULL DEFAULT 8,
    ADD COLUMN IF NOT EXISTS max_items         INTEGER     NOT NULL DEFAULT 50,
    ADD COLUMN IF NOT EXISTS last_notified_at  TIMESTAMPTZ NULL;
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
