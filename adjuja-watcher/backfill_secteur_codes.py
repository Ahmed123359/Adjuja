"""
Calcule secteur_codes pour les lignes scraped_aos existantes (colonne
ajoutee apres le premier scrape, donc jamais remplie pour ces lignes).
Idempotent : peut etre relance sans risque.

Usage:
  cd ao-watcher
  DATABASE_URL=postgresql+asyncpg://... python backfill_secteur_codes.py
"""

import asyncio

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.models import ScrapedAo
from app.modules.ao_scraper.matching import match_secteurs


async def backfill():
    engine = create_async_engine(settings.database_url)
    Session = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with Session() as session:
        rows = (await session.execute(
            select(ScrapedAo.id, ScrapedAo.titre, ScrapedAo.secteur, ScrapedAo.description)
        )).all()

        updated = 0
        matched_count = 0
        for ao_id, titre, secteur, description in rows:
            codes = match_secteurs(titre, secteur, description)
            await session.execute(
                update(ScrapedAo).where(ScrapedAo.id == ao_id).values(secteur_codes=codes)
            )
            updated += 1
            if codes:
                matched_count += 1

        await session.commit()
    await engine.dispose()
    print(f"Backfill termine : {updated} lignes mises a jour, {matched_count} avec au moins un secteur_code.")


if __name__ == "__main__":
    asyncio.run(backfill())
