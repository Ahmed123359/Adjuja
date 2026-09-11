"""
Run once after first deploy to create the watcher schema and tables.
Safe to re-run (idempotent).

Usage:
  cd ao-watcher
  DATABASE_URL=postgresql+asyncpg://... python init_db.py

Base.metadata.create_all(checkfirst=True) creates missing tables but never ALTERs an
already-existing one. After adding `mode_passation` to `ScrapedAo` (filtre "Mode de
passation", 2026-08-21), run this once per environment (dev + prod) against the
already-existing table:

  ALTER TABLE watcher.scraped_aos
    ADD COLUMN IF NOT EXISTS mode_passation VARCHAR(255);
  CREATE INDEX IF NOT EXISTS idx_scraped_aos_mode_passation
    ON watcher.scraped_aos (mode_passation);
"""

import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

from app.core.config import settings
from app.core.database import Base
from app.core.models import ScrapedAo, ScrapedBdc  # noqa: F401  registers the models


async def init():
    engine = create_async_engine(settings.database_url, echo=True)
    async with engine.begin() as conn:
        # Create watcher schema
        await conn.execute(text("CREATE SCHEMA IF NOT EXISTS watcher"))
        # Create all tables in watcher schema
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()
    print("watcher schema and tables created.")


if __name__ == "__main__":
    asyncio.run(init())
