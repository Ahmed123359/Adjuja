from datetime import date, datetime, timezone

import structlog
from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import array
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.models import ScrapedAo
from app.modules.ao_scraper.base import AoData
from app.modules.ao_scraper.matching import match_secteurs

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
        mode_passation: str | None = None,
        search: str | None = None,
        date_limite_from: str | None = None,
        secteur_codes: list[str] | None = None,
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
        if mode_passation:
            q = q.where(ScrapedAo.mode_passation == mode_passation)
        if search:
            q = q.where(
                ScrapedAo.titre.ilike(f"%{search}%")
                | ScrapedAo.acheteur.ilike(f"%{search}%")
            )
        if date_limite_from:
            q = q.where(ScrapedAo.date_limite >= date_limite_from)
        if secteur_codes:
            # Postgres jsonb "?|" : l'AO matche si au moins un des codes
            # demandes est present dans son tableau secteur_codes.
            q = q.where(ScrapedAo.secteur_codes.op("?|")(array(secteur_codes)))

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

        # Deduplicate by (source, external_id)  same AO can appear twice in a page
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
                "mode_passation": ao.mode_passation,
                "secteur": ao.secteur,
                "region": ao.region,
                "ville": ao.ville,
                "budget_estime": ao.budget_estime,
                "caution": ao.caution,
                "description": ao.description,
                "zip_url": ao.zip_url,
                "secteur_codes": match_secteurs(ao.titre, ao.secteur, ao.description),
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
                "budget_estime": stmt.excluded.budget_estime,
                "caution": stmt.excluded.caution,
                "secteur_codes": stmt.excluded.secteur_codes,
                # zip_url vient de l'enrichissement de la page detail, pas du listing :
                # un re-scrape planifie qui ne le porte pas l'ecrasait avec NULL, et
                # le telechargement echouait ensuite avec "has no zip_url" sur des AO
                # qui en avaient un (constate le 2026-09-13 : 509 AO marchespublics
                # et 13/13 safakat vides apres le scrape de la nuit). Meme protection
                # que date_publication / ville / mode_passation ci-dessous.
                "zip_url": func.coalesce(stmt.excluded.zip_url, ScrapedAo.zip_url),
                "updated_at": datetime.now(timezone.utc),
                # Preserve non-null values : listing peut ne pas avoir ville/date_publication/
                # mode_passation (detail-only, absent de listing.cols dans le config scraper),
                # mais la page detail les a -- on ne les efface jamais avec NULL.
                "date_publication": func.coalesce(stmt.excluded.date_publication, ScrapedAo.date_publication),
                "ville": func.coalesce(stmt.excluded.ville, ScrapedAo.ville),
                "mode_passation": func.coalesce(stmt.excluded.mode_passation, ScrapedAo.mode_passation),
                # Preserve: status, classified_docs, zip_minio_key, zip_downloaded_at
            },
        )
        result = await self.db.execute(stmt)
        return result.rowcount

    async def update_status(self, ao_id: int, status: str, clear_zip_error: bool = False) -> ScrapedAo | None:
        values: dict = {"status": status, "updated_at": datetime.now(timezone.utc)}
        if clear_zip_error:
            values["zip_error"] = None
        await self.db.execute(
            update(ScrapedAo)
            .where(ScrapedAo.id == ao_id)
            .values(**values)
        )
        await self.db.commit()
        return await self.get_by_id(ao_id)

    async def update_zip_url(self, ao_id: int, zip_url: str) -> None:
        await self.db.execute(
            update(ScrapedAo)
            .where(ScrapedAo.id == ao_id)
            .values(zip_url=zip_url, updated_at=datetime.now(timezone.utc))
        )
        await self.db.commit()

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

    async def delete_expired_unactioned(self, before: date) -> int:
        """Nettoyage : supprime les AO jamais favorisees/importees dont la date
        limite est depassee. Les AO favorited/imported sont preservees (docs
        deja telecharges, potentiellement encore utiles). Aucun fichier MinIO
        a nettoyer ici : new/seen n'ont jamais declenche de telechargement."""
        result = await self.db.execute(
            delete(ScrapedAo).where(
                ScrapedAo.date_limite < before,
                ScrapedAo.status.in_(["new", "seen"]),
            )
        )
        await self.db.commit()
        return result.rowcount

    async def update_analyse_json(self, ao_id: int, analyse_json: dict) -> None:
        await self.db.execute(
            update(ScrapedAo)
            .where(ScrapedAo.id == ao_id)
            .values(analyse_json=analyse_json, updated_at=datetime.now(timezone.utc))
        )
        await self.db.commit()
