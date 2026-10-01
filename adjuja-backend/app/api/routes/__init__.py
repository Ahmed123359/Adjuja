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
from app.api.routes.filler_routes import router as filler_router
from app.api.routes.offre_technique_routes import router as offre_technique_router
from app.api.routes.marche_routes import router as marche_router
from app.api.routes.ao_routes import router as ao_router
from app.api.routes.company_profile_routes import router as company_profile_router
from app.api.routes.staff_cvs_routes import router as staff_cvs_router
from app.api.routes.company_documents_routes import router as company_documents_router
from app.api.routes.newsletter_routes import router as newsletter_router
from app.api.routes.billing_routes import router as billing_router
from app.api.routes.org_routes import router as org_router
from app.api.routes.dashboard_routes import dashboard_router, messages_router, tasks_router
from app.api.routes.admin_routes import admin_router
from app.api.routes.suivi_routes import suivi_router

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
    "filler_router",
    "offre_technique_router",
    "marche_router",
    "ao_router",
    "company_profile_router",
    "staff_cvs_router",
    "company_documents_router",
    "newsletter_router",
    "billing_router",
    "org_router",
    "dashboard_router",
    "tasks_router",
    "messages_router",
    "admin_router",
    "suivi_router",
]
