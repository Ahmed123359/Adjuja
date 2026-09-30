from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.schema import assurer_colonnes
from app.modules.ao_scraper.router import router as ao_router
from app.modules.ao_scraper.router import secteurs_router
from app.modules.bdc_scraper.router import router as bdc_router

log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("AO Watcher starting", port=settings.watcher_api_port)
    await assurer_colonnes()
    yield
    log.info("AO Watcher shutting down")


app = FastAPI(
    title="AO Watcher",
    description="Scrapes Moroccan public procurement portals (MPE platform)",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://frontend:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ao_router)
app.include_router(secteurs_router)
app.include_router(bdc_router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ao-watcher"}
