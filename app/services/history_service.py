from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Launch
from app.models.generation import GenerationResult
from app.models.history import HistoryEntry, HistorySummary


class HistoryService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def add(self, entry: HistoryEntry) -> None:
        self._db.add(Launch(
            id=entry.id,
            user_id=entry.user_id,
            created_at=entry.created_at,
            ao_excerpt=entry.ao_excerpt,
            company_nom=entry.company_nom,
            provider=entry.provider,
            model=entry.model,
            tokens_utilises=entry.tokens_utilises,
            langue=entry.langue,
            result_json=entry.result.model_dump_json(),
        ))
        await self._db.commit()

    async def list_summaries(self, user_id: str) -> list[HistorySummary]:
        result = await self._db.execute(
            select(Launch)
            .where(Launch.user_id == user_id)
            .order_by(Launch.created_at.desc())
        )
        return [
            HistorySummary(
                id=r.id, user_id=r.user_id, created_at=r.created_at,
                ao_excerpt=r.ao_excerpt, company_nom=r.company_nom,
                provider=r.provider, model=r.model,
                tokens_utilises=r.tokens_utilises, langue=r.langue,
            )
            for r in result.scalars().all()
        ]

    async def get(self, entry_id: str, user_id: str) -> HistoryEntry | None:
        result = await self._db.execute(
            select(Launch).where(Launch.id == entry_id, Launch.user_id == user_id)
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None
        return HistoryEntry(
            id=row.id, user_id=row.user_id, created_at=row.created_at,
            ao_excerpt=row.ao_excerpt, company_nom=row.company_nom,
            provider=row.provider, model=row.model,
            tokens_utilises=row.tokens_utilises, langue=row.langue,
            result=GenerationResult.model_validate_json(row.result_json),
        )

    async def delete(self, entry_id: str, user_id: str) -> bool:
        result = await self._db.execute(
            delete(Launch).where(Launch.id == entry_id, Launch.user_id == user_id)
        )
        await self._db.commit()
        return result.rowcount > 0

    async def clear(self, user_id: str) -> None:
        await self._db.execute(delete(Launch).where(Launch.user_id == user_id))
        await self._db.commit()
