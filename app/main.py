from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from app.api.routes import (
    generation_router, models_router, rag_router,
    defaults_router, usage_router, history_router,
)
from app.config.settings import get_settings

settings = get_settings()

app = FastAPI(
    title="Générateur de Réponses AO",
    description=(
        "API de génération automatique de réponses aux appels d'offres. "
        "Supporte plusieurs providers LLM : OpenAI, Anthropic (Claude), Mistral."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — à restreindre en production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.app_debug else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enregistrement des routes
app.include_router(generation_router, prefix="/api/v1")
app.include_router(models_router,    prefix="/api/v1")
app.include_router(rag_router,       prefix="/api/v1")
app.include_router(defaults_router,  prefix="/api/v1")
app.include_router(usage_router,     prefix="/api/v1")
app.include_router(history_router,   prefix="/api/v1")


@app.get("/", include_in_schema=False)
def root():
    """Redirige vers l'interface web."""
    return RedirectResponse(url="/ui/")


@app.get("/health", tags=["Santé"])
def health():
    return {"status": "ok"}


# ── Interface web (fichiers statiques) ─────────────────────────────────
# Doit être déclaré en dernier pour ne pas intercepter les routes API.
_FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"
if _FRONTEND_DIST.exists():
    app.mount("/ui", StaticFiles(directory=str(_FRONTEND_DIST), html=True), name="frontend")
