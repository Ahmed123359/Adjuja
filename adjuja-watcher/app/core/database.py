from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings


class Base(DeclarativeBase):
    pass


# Persistent engine for the FastAPI app (connection pool ok here)
engine = create_async_engine(settings.database_url, echo=False)

async_session_factory = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def get_db() -> AsyncSession:
    async with async_session_factory() as session:
        yield session


@asynccontextmanager
async def task_db():
    """
    Fresh engine with NullPool for Celery tasks.
    Each prefork worker process gets its own clean connection  no shared pool state.
    """
    task_engine = create_async_engine(settings.database_url, poolclass=NullPool)
    task_session = sessionmaker(task_engine, class_=AsyncSession, expire_on_commit=False)
    async with task_session() as session:
        try:
            yield session
        finally:
            await task_engine.dispose()
