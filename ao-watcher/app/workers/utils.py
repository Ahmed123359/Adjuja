import asyncio
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings


def run_async(coro):
    """Run an async coroutine from a sync Celery prefork task."""
    return asyncio.run(coro)


@asynccontextmanager
async def task_db():
    """
    Fresh engine per Celery task  NullPool prevents cross-process state
    when using prefork workers.
    """
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        try:
            yield session
        finally:
            await engine.dispose()
