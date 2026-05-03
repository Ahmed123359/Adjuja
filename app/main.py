import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from app.api.routes import (
    generation_router, models_router, rag_router,
    defaults_router, usage_router, history_router, auth_router, pdf_router, brief_router,
    signing_router, bordereau_router, acte_engagement_router, chat_router, export_router,
    filler_router, offre_technique_router,
)
from app.config.settings import get_settings
from app.limiter import limiter

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.db.base import engine
    from app.db.models import Base  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


# ── Configuration du logging ────────────────────────────────────────────────
# Configuré une seule fois ici au démarrage. Tous les modules de l'app utilisent
# ensuite logging.getLogger(__name__) pour obtenir un logger nommé d'après leur
# fichier (ex: "app.api.routes.generation_routes"), ce qui facilite le filtrage.
#
# Niveau :
#   - DEBUG en dev  → tous les messages, très verbeux
#   - INFO  en prod → seulement les événements importants
#
# Format : timestamp | niveau | module | message
# Exemple : 2024-01-15 03:42:11 INFO  app.services.generation_service — Génération démarrée
logging.basicConfig(
    level=logging.DEBUG if settings.app_debug else logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
# Réduire le bruit des bibliothèques tierces (httpx, uvicorn, etc.)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)
logger.info("Démarrage de l'application OffrIA (env=%s)", settings.app_env)
# ────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    lifespan=lifespan,
    title="Générateur de réponses AO",
    description=(
        "API de génération automatique de réponses aux appels d'offres. "
        "Supporte plusieurs providers LLM : OpenAI, Anthropic (Claude), Mistral."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Rate limiting — limite le nombre de requêtes par utilisateur sur POST /generate.
# Le limiter stocke les compteurs en mémoire (dict Python).
# SlowAPIMiddleware intercepte chaque requête pour incrémenter les compteurs.
# _rate_limit_exceeded_handler renvoie HTTP 429 avec un message clair si la limite est dépassée.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# CORS — contrôle des origines cross-origin autorisées.
#
# En développement (APP_DEBUG=true) :
#   → ["*"] : tout est autorisé, pratique pour travailler avec Vite (port 5173)
#     sans avoir à configurer quoi que ce soit.
#
# En production (APP_DEBUG=false) :
#   → settings.allowed_origins : liste explicite définie dans ALLOWED_ORIGINS du .env.
#     Exemple : ["https://monsite.com"]
#     Si vide, le navigateur bloquera toutes les requêtes cross-origin
#     (note : en prod le frontend est souvent servi par le même domaine via un proxy,
#      donc CORS peut ne pas être nécessaire — mais mieux vaut le configurer.)
#
# Note technique : ["*"] est incompatible avec allow_credentials=True selon la spec CORS.
# Le navigateur refuse cette combinaison. On doit donc lister les origines explicitement
# en production dès qu'on envoie des credentials (token Bearer dans Authorization).
_cors_origins = ["*"] if settings.app_debug else settings.allowed_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enregistrement des routes
app.include_router(auth_router,       prefix="/api/v1")
app.include_router(generation_router, prefix="/api/v1")
app.include_router(models_router,    prefix="/api/v1")
app.include_router(rag_router,       prefix="/api/v1")
app.include_router(defaults_router,  prefix="/api/v1")
app.include_router(usage_router,     prefix="/api/v1")
app.include_router(history_router,   prefix="/api/v1")
app.include_router(pdf_router,       prefix="/api/v1")
app.include_router(brief_router,     prefix="/api/v1")
app.include_router(signing_router,          prefix="/api/v1")
app.include_router(bordereau_router,        prefix="/api/v1")
app.include_router(acte_engagement_router,  prefix="/api/v1")
app.include_router(chat_router,             prefix="/api/v1")
app.include_router(export_router,           prefix="/api/v1")
app.include_router(filler_router,            prefix="/api/v1")
app.include_router(offre_technique_router,   prefix="/api/v1")


@app.get("/", include_in_schema=False)
def root():
    """Redirige vers l'interface web."""
    return RedirectResponse(url="/ui/")


@app.get("/sitemap.xml", include_in_schema=False)
def sitemap():
    """Sitemap XML pour les moteurs de recherche."""
    content = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://offria.cloud</loc>
    <lastmod>2026-03-23</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>"""
    return Response(content=content, media_type="application/xml")


@app.get("/robots.txt", include_in_schema=False)
def robots():
    """Robots.txt pour les crawlers."""
    content = "User-agent: *\nAllow: /\nSitemap: https://offria.cloud/sitemap.xml\n"
    return Response(content=content, media_type="text/plain")


@app.get("/health", tags=["Santé"])
async def health(response: Response):
    """
    Vérifie l'état de santé de l'application.

    Effectue trois vérifications :
    1. SQLite — une requête SELECT 1 sur la base de données.
       Si elle échoue, l'app est inutilisable → HTTP 503.
    2. Clés API — vérifie qu'au moins un provider LLM est configuré.
       Sans clé, aucune génération n'est possible → HTTP 503.
    3. Qdrant — ping optionnel, uniquement si QDRANT_URL est défini.
       Un échec Qdrant dégrade le RAG mais pas la génération de base.

    Retourne HTTP 200 si tout est opérationnel, HTTP 503 sinon.
    Utilisé par Docker healthcheck et les load balancers pour détecter
    une instance morte et la sortir de la rotation.
    """
    checks: dict[str, str] = {}
    tout_ok = True

    # ── 1. PostgreSQL ────────────────────────────────────────────────────
    try:
        from sqlalchemy import text
        from app.db.base import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        checks["postgres"] = "ok"
    except Exception as e:
        checks["postgres"] = f"error: {e}"
        tout_ok = False

    # ── 2. Clés API ──────────────────────────────────────────────────────
    # On ne renvoie jamais les clés elles-mêmes — juste leur présence.
    # Si aucune clé n'est configurée, aucune génération ne peut aboutir.
    cles_presentes = [
        p for p, k in {
            "openai":    settings.openai_api_key,
            "anthropic": settings.anthropic_api_key,
            "mistral":   settings.mistral_api_key,
        }.items() if k
    ]
    if cles_presentes:
        checks["api_keys"] = f"ok ({', '.join(cles_presentes)})"
    else:
        checks["api_keys"] = "error: aucune clé API configurée"
        tout_ok = False

    # ── 3. Qdrant (optionnel) ────────────────────────────────────────────
    # Si QDRANT_URL n'est pas défini, le RAG est simplement désactivé —
    # ce n'est pas une erreur. On ping seulement si l'URL est configurée.
    if settings.qdrant_url:
        try:
            import httpx
            r = httpx.get(f"{settings.qdrant_url}/healthz", timeout=2)
            checks["qdrant"] = "ok" if r.is_success else f"error: HTTP {r.status_code}"
        except Exception as e:
            checks["qdrant"] = f"error: {e}"
        # Un échec Qdrant ne rend pas l'app indisponible (dégradation gracieuse)
    else:
        checks["qdrant"] = "non configuré (RAG désactivé)"

    if not tout_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {"status": "ok" if tout_ok else "degraded", "checks": checks}


# ── Interface web (fichiers statiques) ─────────────────────────────────
# Doit être déclaré en dernier pour ne pas intercepter les routes API.
_FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"
if _FRONTEND_DIST.exists():
    app.mount("/ui", StaticFiles(directory=str(_FRONTEND_DIST), html=True), name="frontend")
