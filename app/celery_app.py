from celery import Celery
from celery.schedules import crontab
from app.config.settings import get_settings

settings = get_settings()

celery_app = Celery(
    "offria",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.tasks.ao_tasks", "app.tasks.tools_tasks", "app.tasks.billing_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Africa/Casablanca",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_routes={
        "app.tasks.ao_tasks.task_analyze_ao_context":  {"queue": "celery_io"},
        "app.tasks.ao_tasks.task_classify_uploads":    {"queue": "celery_io"},
        "app.tasks.ao_tasks.task_build_pipeline":      {"queue": "celery_io"},
        "app.tasks.ao_tasks.task_generate_note_metho": {"queue": "celery_cpu"},
        "app.tasks.ao_tasks.task_fill_documents":      {"queue": "celery_cpu"},
        "app.tasks.ao_tasks.task_sign_and_compile":    {"queue": "celery_cpu"},
        "app.tasks.ao_tasks.task_index_results":       {"queue": "celery_io"},
        "app.tasks.ao_tasks.task_dummy_pipeline":      {"queue": "celery_io"},
        "app.tasks.tools_tasks.task_sign_pdf":         {"queue": "celery_cpu"},
        "app.tasks.tools_tasks.task_run_filler":       {"queue": "celery_cpu"},
        "app.tasks.billing_tasks.sweep_subscriptions": {"queue": "celery_io"},
    },
    beat_schedule={
        "billing-dunning-sweep": {
            "task": "app.tasks.billing_tasks.sweep_subscriptions",
            "schedule": crontab(hour=6, minute=0),  # 06h00 Africa/Casablanca
        },
    },
)
