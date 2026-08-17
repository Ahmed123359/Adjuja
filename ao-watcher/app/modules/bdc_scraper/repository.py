from datetime import date, datetime, timezone

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.models import ScrapedBdc
from app.modules.bdc_scraper.base import BdcData


class BdcRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------ #
    #  Read                                                               #
    # ------------------------------------------------------------------ #

    async def get_by_id(self, bdc_id: int) -> ScrapedBdc | None:
        result = await self.db.execute(
            select(ScrapedBdc).where(ScrapedBdc.id == bdc_id)
        )
        return result.scalar_one_or_none()

    async def list_bdc(
        self,
        status: str | None = None,
        region: str | None = None,
        categorie: str | None = None,
        nature_prestations: list[str] | None = None,
        search: str | None = None,
        date_limite_from: str | None = None,
        page: int = 1,
        limit: int = 50,
    ) -> tuple[list[ScrapedBdc], int]:
        q = select(ScrapedBdc)

        if status and status != "all":
            q = q.where(ScrapedBdc.status == status)
        if region:
            q = q.where(ScrapedBdc.region.ilike(f"%{region}%"))
        if categorie:
            q = q.where(ScrapedBdc.categorie.ilike(f"%{categorie}%"))
        if nature_prestations:
            q = q.where(ScrapedBdc.nature_prestation.in_(nature_prestations))
        if search:
            q = q.where(
                ScrapedBdc.titre.ilike(f"%{search}%")
                | ScrapedBdc.acheteur.ilike(f"%{search}%")
            )
        if date_limite_from:
            q = q.where(ScrapedBdc.date_limite >= date_limite_from)

        count_q = select(func.count()).select_from(q.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        q = q.order_by(ScrapedBdc.scraped_at.desc()).offset((page - 1) * limit).limit(limit)
        rows = (await self.db.execute(q)).scalars().all()
        return list(rows), total

    async def get_stats(self) -> dict:
        result = await self.db.execute(
            select(
                ScrapedBdc.categorie,
                ScrapedBdc.region,
                ScrapedBdc.status,
                func.count().label("count"),
            ).group_by(
                ScrapedBdc.categorie,
                ScrapedBdc.region,
                ScrapedBdc.status,
            )
        )
        rows = result.all()
        return {
            "raw": [
                {"categorie": r.categorie, "region": r.region, "status": r.status, "count": r.count}
                for r in rows
            ],
        }

    # ------------------------------------------------------------------ #
    #  Write                                                              #
    # ------------------------------------------------------------------ #

    async def upsert_many(self, items: list[BdcData]) -> int:
        """Upsert un batch de BdcData. ON CONFLICT : rafraichit les metadonnees
        mais preserve `status` (un BDC favorise reste favorise apres re-scrape)."""
        if not items:
            return 0

        seen: dict[tuple, BdcData] = {}
        for item in items:
            seen[(item.source, item.external_id)] = item
        items = list(seen.values())

        rows = [
            {
                "source": d.source,
                "external_id": d.external_id,
                "url_source": d.url_source,
                "titre": d.titre,
                "acheteur": d.acheteur,
                "date_publication": d.date_publication,
                "date_limite": d.date_limite,
                "categorie": d.categorie,
                "nature_prestation": d.nature_prestation,
                "region": d.region,
                "ville": d.ville,
                "est_annule": d.est_annule,
                "date_annulation": d.date_annulation,
                "raison_annulation": d.raison_annulation,
                "document_url": d.document_url,
                "document_nom": d.document_nom,
                "status": "new",
            }
            for d in items
        ]

        stmt = pg_insert(ScrapedBdc).values(rows)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_bdc_source_external",
            set_={
                "titre": stmt.excluded.titre,
                "acheteur": stmt.excluded.acheteur,
                "date_publication": stmt.excluded.date_publication,
                "date_limite": stmt.excluded.date_limite,
                "categorie": stmt.excluded.categorie,
                "nature_prestation": stmt.excluded.nature_prestation,
                "region": stmt.excluded.region,
                "ville": stmt.excluded.ville,
                "est_annule": stmt.excluded.est_annule,
                "date_annulation": stmt.excluded.date_annulation,
                "raison_annulation": stmt.excluded.raison_annulation,
                "document_url": stmt.excluded.document_url,
                "document_nom": stmt.excluded.document_nom,
                "updated_at": datetime.now(timezone.utc),
                # Preserve: status
            },
        )
        result = await self.db.execute(stmt)
        return result.rowcount

    async def update_status(self, bdc_id: int, status: str) -> ScrapedBdc | None:
        await self.db.execute(
            update(ScrapedBdc)
            .where(ScrapedBdc.id == bdc_id)
            .values(status=status, updated_at=datetime.now(timezone.utc))
        )
        await self.db.commit()
        return await self.get_by_id(bdc_id)

    async def delete_expired_unactioned(self, before: date) -> int:
        """Nettoyage : supprime les BDC jamais favorises dont la date limite
        est depassee. Les BDC favorises sont preserves. Aucun fichier MinIO
        a nettoyer ici : new/seen n'ont jamais declenche de telechargement."""
        result = await self.db.execute(
            delete(ScrapedBdc).where(
                ScrapedBdc.date_limite < before,
                ScrapedBdc.status.in_(["new", "seen"]),
            )
        )
        await self.db.commit()
        return result.rowcount

    async def update_zip_result(
        self,
        bdc_id: int,
        zip_minio_key: str | None,
        error: str | None,
    ) -> None:
        values: dict = {"updated_at": datetime.now(timezone.utc)}
        if error:
            values["zip_error"] = error
        else:
            values["zip_minio_key"] = zip_minio_key
            values["zip_downloaded_at"] = datetime.now(timezone.utc)
            values["zip_error"] = None

        await self.db.execute(
            update(ScrapedBdc).where(ScrapedBdc.id == bdc_id).values(**values)
        )
        await self.db.commit()
