from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Usage


class UsageService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def _upsert_row(self) -> None:
        """Crée la ligne id=1 si elle n'existe pas, en une seule requête atomique."""
        await self._db.execute(
            pg_insert(Usage).values(id=1, total_tokens=0, total_appels=0, total_tokens_ocr=0)
            .on_conflict_do_nothing(index_elements=["id"])
        )
        await self._db.commit()

    async def get_totals(self) -> dict:
        result = await self._db.execute(select(Usage).where(Usage.id == 1))
        row = result.scalar_one_or_none()
        if row is None:
            await self._upsert_row()
            return {"total_tokens": 0, "total_appels": 0, "total_tokens_ocr": 0}
        return {
            "total_tokens":     row.total_tokens,
            "total_appels":     row.total_appels,
            "total_tokens_ocr": row.total_tokens_ocr,
        }

    async def add(self, tokens: int) -> None:
        await self._db.execute(
            pg_insert(Usage).values(id=1, total_tokens=tokens, total_appels=1, total_tokens_ocr=0)
            .on_conflict_do_update(
                index_elements=["id"],
                set_={"total_tokens": Usage.total_tokens + tokens, "total_appels": Usage.total_appels + 1},
            )
        )
        await self._db.commit()

    async def add_tokens(self, tokens: int) -> None:
        await self._db.execute(
            pg_insert(Usage).values(id=1, total_tokens=tokens, total_appels=0, total_tokens_ocr=0)
            .on_conflict_do_update(
                index_elements=["id"],
                set_={"total_tokens": Usage.total_tokens + tokens},
            )
        )
        await self._db.commit()

    async def add_ocr_tokens(self, tokens: int) -> None:
        await self._db.execute(
            pg_insert(Usage).values(id=1, total_tokens=0, total_appels=0, total_tokens_ocr=tokens)
            .on_conflict_do_update(
                index_elements=["id"],
                set_={"total_tokens_ocr": Usage.total_tokens_ocr + tokens},
            )
        )
        await self._db.commit()

    async def reset(self) -> None:
        await self._db.execute(
            pg_insert(Usage).values(id=1, total_tokens=0, total_appels=0, total_tokens_ocr=0)
            .on_conflict_do_update(
                index_elements=["id"],
                set_={"total_tokens": 0, "total_appels": 0, "total_tokens_ocr": 0},
            )
        )
        await self._db.commit()
