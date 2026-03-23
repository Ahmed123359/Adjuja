from app.api.routes.generation_routes import router as generation_router
from app.api.routes.models_routes import router as models_router
from app.api.routes.rag_routes import router as rag_router
from app.api.routes.defaults_routes import router as defaults_router
from app.api.routes.usage_routes import router as usage_router
from app.api.routes.history_routes import router as history_router
from app.api.routes.auth_routes import router as auth_router
from app.api.routes.pdf_routes import router as pdf_router
from app.api.routes.brief_routes import router as brief_router
from app.api.routes.signing_routes import router as signing_router
from app.api.routes.bordereau_routes import router as bordereau_router
from app.api.routes.acte_engagement_routes import router as acte_engagement_router
from app.api.routes.chat_routes import router as chat_router
from app.api.routes.export_routes import router as export_router

__all__ = [
    "generation_router",
    "models_router",
    "rag_router",
    "defaults_router",
    "usage_router",
    "history_router",
    "auth_router",
    "pdf_router",
    "brief_router",
    "signing_router",
    "bordereau_router",
    "acte_engagement_router",
    "chat_router",
    "export_router",
]
