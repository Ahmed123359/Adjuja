from fastapi import FastAPI

from app.api.router import router
from app.templates.ao_digest import AoDigestTemplate
from app.templates.registry import TemplateRegistry

# Le worker Celery peuple channels/templates à l'import de celery_app.py -- le
# process API a besoin des mêmes registrations pour envoyer directement (ex: test-send).
import app.channels.email.resend_channel  # noqa: F401
TemplateRegistry.register("ao_digest", AoDigestTemplate())

app = FastAPI(
    title="ADJUJA Notification Service",
    version="1.0.0",
    docs_url="/docs",
)

app.include_router(router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "notification-service"}
