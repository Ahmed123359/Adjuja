"""
Tâches Celery pour les outils manuels (signature et remplissage).
Exécutées sur la queue celery_cpu, état stocké en Redis (TTL 24h).
"""
import asyncio
import json
import logging
import re
from pathlib import Path

import redis as redis_lib
from celery import shared_task

from app.config.settings import get_settings
from app.storage import minio_client as mc

logger = logging.getLogger(__name__)

_JOB_TTL = 86400  # 24 h
_JOB_KEY = "tools:job:{}"
_UNSAFE = re.compile(r"[^\w\-]")


def _redis():
    return redis_lib.from_url(get_settings().redis_url, decode_responses=True)


def set_job(job_id: str, data: dict) -> None:
    _redis().setex(_JOB_KEY.format(job_id), _JOB_TTL, json.dumps(data))


def get_job(job_id: str) -> dict | None:
    raw = _redis().get(_JOB_KEY.format(job_id))
    return json.loads(raw) if raw else None


def _safe(name: str | None) -> str:
    stem = Path(name or "document").stem
    return _UNSAFE.sub("_", stem)[:80] or "document"


def _run_async(coro):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        try:
            from app.db.base import engine
            loop.run_until_complete(engine.dispose())
        except Exception:
            pass
        loop.close()
        asyncio.set_event_loop(None)


# ─────────────────────────────────────────────────────────────────────────────
#  Tâche : signature PDF
# ─────────────────────────────────────────────────────────────────────────────

@shared_task(
    name="app.tasks.tools_tasks.task_sign_pdf",
    bind=True,
    queue="celery_cpu",
    acks_late=True,
)
def task_sign_pdf(
    self,
    job_id: str,
    org_id: str,
    pdf_key: str,
    sig_key: str | None,
    cac_key: str | None,
    sig_w: int, sig_h: int, sig_mx: int, sig_my: int,
    cac_w: int, cac_h: int, cac_mx: int, cac_my: int,
    fait_a_lieu: str,
    fait_a_date: str,
    original_filename: str,
    paraphe: bool = False,
) -> dict:
    set_job(job_id, {"status": "running", "type": "sign", "org_id": org_id})
    try:
        from app.services.signing_service import sign_pdf

        pdf_bytes = mc.get_file_bytes(pdf_key)
        sig_bytes = mc.get_file_bytes(sig_key) if sig_key else None
        cac_bytes = mc.get_file_bytes(cac_key) if cac_key else None

        signed = sign_pdf(
            pdf_bytes, sig_bytes, cac_bytes,
            lu_et_accepte_bytes=None,
            sig_w=sig_w, sig_h=sig_h, sig_mx=sig_mx, sig_my=sig_my,
            cac_w=cac_w, cac_h=cac_h, cac_mx=cac_mx, cac_my=cac_my,
            fait_a_lieu=fait_a_lieu, fait_a_date=fait_a_date,
            paraphe=paraphe,
        )

        result_key = f"{org_id}/tools/signing/{job_id}/{_safe(original_filename)}_signe.pdf"
        mc.upload_bytes(result_key, signed, "application/pdf")

        set_job(job_id, {
            "status": "done",
            "type": "sign",
            "org_id": org_id,
            "result_key": result_key,
            "filename": f"{_safe(original_filename)}_signe.pdf",
        })
        return {"status": "done"}

    except Exception as exc:
        logger.exception("task_sign_pdf failed job=%s", job_id)
        set_job(job_id, {
            "status": "failed",
            "type": "sign",
            "org_id": org_id,
            "error": str(exc),
        })
        raise


# ─────────────────────────────────────────────────────────────────────────────
#  Tâche : remplissage dossier AO
# ─────────────────────────────────────────────────────────────────────────────

@shared_task(
    name="app.tasks.tools_tasks.task_run_filler",
    bind=True,
    queue="celery_cpu",
    acks_late=True,
)
def task_run_filler(
    self,
    job_id: str,
    org_id: str,
    pdf_key: str,
    filename: str,
    company_case: str,
    lots: list[int],
    api_key: str,
    marche_id: str | None,
) -> dict:
    set_job(job_id, {"status": "running", "type": "filler", "org_id": org_id})
    try:
        from app.services.filler_service import run_filler

        pdf_bytes = mc.get_file_bytes(pdf_key)

        result = _run_async(run_filler(
            pdf_bytes=pdf_bytes,
            filename=filename,
            company_case=company_case,
            lots=lots,
            api_key=api_key,
            org_id=org_id,
            marche_id=marche_id,
        ))

        set_job(job_id, {
            "status": "done",
            "type": "filler",
            "org_id": org_id,
            "result": result.model_dump(),
        })
        return {"status": "done"}

    except Exception as exc:
        logger.exception("task_run_filler failed job=%s", job_id)
        set_job(job_id, {
            "status": "failed",
            "type": "filler",
            "org_id": org_id,
            "error": str(exc),
        })
        raise
