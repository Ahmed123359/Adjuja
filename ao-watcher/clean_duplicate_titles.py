"""
Nettoie les titres deja en base affectes par la duplication objet
(apercu tronque + texte complet captures ensemble par get_text() avant le
fix de mpe.py::_collapse_duplicate_title). Ne re-scrape rien, corrige juste
le texte deja stocke. Idempotent : peut etre relance sans risque.

Usage:
  cd ao-watcher
  DATABASE_URL=postgresql+asyncpg://... python clean_duplicate_titles.py
"""

import asyncio

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.models import ScrapedAo
from app.modules.ao_scraper.mpe import _collapse_duplicate_title


async def clean():
    engine = create_async_engine(settings.database_url)
    Session = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with Session() as session:
        rows = (await session.execute(
            select(ScrapedAo.id, ScrapedAo.titre)
        )).all()

        updated = 0
        for ao_id, titre in rows:
            if not titre:
                continue
            cleaned = _collapse_duplicate_title(titre)
            if cleaned != titre:
                await session.execute(
                    update(ScrapedAo).where(ScrapedAo.id == ao_id).values(titre=cleaned)
                )
                updated += 1

        await session.commit()
    await engine.dispose()
    print(f"Nettoyage termine : {updated} titres dedupliques sur {len(rows)} lignes.")


if __name__ == "__main__":
    asyncio.run(clean())
