from fastapi import FastAPI

from app.api.router import router

app = FastAPI(
    title="ADJUJA Notification Service",
    version="1.0.0",
    docs_url="/docs",
)

app.include_router(router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "notification-service"}
