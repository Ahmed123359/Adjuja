from datetime import datetime, timezone

import structlog
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.models import ScrapedAo
from app.modules.ao_scraper.base import AoData

log = structlog.get_logger(__name__)


class AoRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------ #
    #  Read                                                                #
    # ------------------------------------------------------------------ #

    async def get_by_id(self, ao_id: int) -> ScrapedAo | None:
        result = await self.db.execute(
            select(ScrapedAo).where(ScrapedAo.id == ao_id)
        )
        return result.scalar_one_or_none()

    async def get_by_source_external(self, source: str, external_id: str) -> ScrapedAo | None:
        result = await self.db.execute(
            select(ScrapedAo).where(
                ScrapedAo.source == source,
                ScrapedAo.external_id == external_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_aos(
        self,
        status: str | None = None,
        region: str | None = None,
        categorie: str | None = None,
        search: str | None = None,
        date_limite_from: str | None = None,
        page: int = 1,
        limit: int = 50,
    ) -> tuple[list[ScrapedAo], int]:
        q = select(ScrapedAo)

        if status and status != "all":
            q = q.where(ScrapedAo.status == status)
        if region:
            q = q.where(ScrapedAo.region.ilike(f"%{region}%"))
        if categorie:
            q = q.where(ScrapedAo.categorie.ilike(f"%{categorie}%"))
        if search:
            q = q.where(
                ScrapedAo.titre.ilike(f"%{search}%")
                | ScrapedAo.acheteur.ilike(f"%{search}%")
            )
        if date_limite_from:
            q = q.where(ScrapedAo.date_limite >= date_limite_from)

        # Count
        from sqlalchemy import func
        count_q = select(func.count()).select_from(q.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        # Paginate
        q = q.order_by(ScrapedAo.scraped_at.desc()).offset((page - 1) * limit).limit(limit)
        rows = (await self.db.execute(q)).scalars().all()
        return list(rows), total

    async def get_stats(self) -> dict:
        from sqlalchemy import func, distinct
        result = await self.db.execute(
            select(
                ScrapedAo.categorie,
                ScrapedAo.region,
                ScrapedAo.source,
                ScrapedAo.status,
                func.count().label("count"),
            ).group_by(
                ScrapedAo.categorie,
                ScrapedAo.region,
                ScrapedAo.source,
                ScrapedAo.status,
            )
        )
        rows = result.all()
        return {
            "by_categorie": {},
            "by_region": {},
            "by_source": {},
            "by_status": {},
            "raw": [
                {"categorie": r.categorie, "region": r.region,
                 "source": r.source, "status": r.status, "count": r.count}
                for r in rows
            ],
        }

    async def get_new_external_ids(self, source: str) -> set[str]:
        """Return all external_ids already in DB for this source."""
        result = await self.db.execute(
            select(ScrapedAo.external_id).where(ScrapedAo.source == source)
        )
        return {row[0] for row in result.all()}

    # ------------------------------------------------------------------ #
    #  Write                                                               #
    # ------------------------------------------------------------------ #

    async def upsert_many(self, aos: list[AoData]) -> int:
        """
        Upsert a batch of AoData rows.
        ON CONFLICT: update metadata fields but preserve status and classified_docs.
        Returns number of rows affected.
        """
        if not aos:
            return 0

        # Deduplicate by (source, external_id) — same AO can appear twice in a page
        seen: dict[tuple, AoData] = {}
        for ao in aos:
            seen[(ao.source, ao.external_id)] = ao
        aos = list(seen.values())

        rows = [
            {
                "source": ao.source,
                "external_id": ao.external_id,
                "url_source": ao.url_source,
                "titre": ao.titre,
                "acheteur": ao.acheteur,
                "date_publication": ao.date_publication,
                "date_limite": ao.date_limite,
                "categorie": ao.categorie,
                "secteur": ao.secteur,
                "region": ao.region,
                "ville": ao.ville,
                "budget_estime": ao.budget_estime,
                "caution": ao.caution,
                "description": ao.description,
                "zip_url": ao.zip_url,
                "status": "new",
            }
            for ao in aos
        ]

        stmt = pg_insert(ScrapedAo).values(rows)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_source_external",
            set_={
                # Refresh metadata
                "titre": stmt.excluded.titre,
                "acheteur": stmt.excluded.acheteur,
                "date_limite": stmt.excluded.date_limite,
                "categorie": stmt.excluded.categorie,
                "secteur": stmt.excluded.secteur,
                "region": stmt.excluded.region,
                "ville": stmt.excluded.ville,
                "budget_estime": stmt.excluded.budget_estime,
                "caution": stmt.excluded.caution,
                "zip_url": stmt.excluded.zip_url,
                "updated_at": datetime.now(timezone.utc),
                # Preserve: status, classified_docs, zip_minio_key, zip_downloaded_at
            },
        )
        result = await self.db.execute(stmt)
        return result.rowcount

    async def update_status(self, ao_id: int, status: str) -> ScrapedAo | None:
        await self.db.execute(
            update(ScrapedAo)
            .where(ScrapedAo.id == ao_id)
            .values(status=status, updated_at=datetime.now(timezone.utc))
        )
        await self.db.commit()
        return await self.get_by_id(ao_id)

    async def update_zip_result(
        self,
        ao_id: int,
        zip_minio_key: str | None,
        classified_docs: dict | None,
        error: str | None,
    ) -> None:
        values: dict = {"updated_at": datetime.now(timezone.utc)}
        if error:
            values["zip_error"] = error
        else:
            values["zip_minio_key"] = zip_minio_key
            values["classified_docs"] = classified_docs
            values["zip_downloaded_at"] = datetime.now(timezone.utc)
            values["zip_error"] = None

        await self.db.execute(
            update(ScrapedAo).where(ScrapedAo.id == ao_id).values(**values)
        )
        await self.db.commit()
