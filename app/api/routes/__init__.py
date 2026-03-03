from app.api.routes.generation_routes import router as generation_router
from app.api.routes.models_routes import router as models_router
from app.api.routes.rag_routes import router as rag_router
from app.api.routes.defaults_routes import router as defaults_router
from app.api.routes.usage_routes import router as usage_router
from app.api.routes.history_routes import router as history_router
from app.api.routes.auth_routes import router as auth_router

__all__ = [
    "generation_router",
    "models_router",
    "rag_router",
    "defaults_router",
    "usage_router",
    "history_router",
    "auth_router",
]
