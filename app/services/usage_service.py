from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Usage


class UsageService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def _ensure_row(self) -> None:
        result = await self._db.execute(select(Usage).where(Usage.id == 1))
        if result.scalar_one_or_none() is None:
            self._db.add(Usage(id=1))
            await self._db.commit()

    async def get_totals(self) -> dict:
        await self._ensure_row()
        result = await self._db.execute(select(Usage).where(Usage.id == 1))
        row = result.scalar_one()
        return {
            "total_tokens":     row.total_tokens,
            "total_appels":     row.total_appels,
            "total_tokens_ocr": row.total_tokens_ocr,
        }

    async def add(self, tokens: int) -> None:
        await self._ensure_row()
        await self._db.execute(
            update(Usage).where(Usage.id == 1).values(
                total_tokens=Usage.total_tokens + tokens,
                total_appels=Usage.total_appels + 1,
            )
        )
        await self._db.commit()

    async def add_tokens(self, tokens: int) -> None:
        await self._ensure_row()
        await self._db.execute(
            update(Usage).where(Usage.id == 1).values(
                total_tokens=Usage.total_tokens + tokens,
            )
        )
        await self._db.commit()

    async def add_ocr_tokens(self, tokens: int) -> None:
        await self._ensure_row()
        await self._db.execute(
            update(Usage).where(Usage.id == 1).values(
                total_tokens_ocr=Usage.total_tokens_ocr + tokens,
            )
        )
        await self._db.commit()

    async def reset(self) -> None:
        await self._ensure_row()
        await self._db.execute(
            update(Usage).where(Usage.id == 1).values(
                total_tokens=0, total_appels=0, total_tokens_ocr=0,
            )
        )
        await self._db.commit()
