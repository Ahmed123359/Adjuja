import io
import json
import random
import re
import zipfile
from urllib.parse import urljoin

import httpx
import structlog
from bs4 import BeautifulSoup
from minio import Minio

from app.core.config import settings
from app.modules.ao_scraper.repository import AoRepository
from app.workers.celery_app import celery_app
from app.workers.utils import run_async, task_db

log = structlog.get_logger(__name__)

CLASSIFICATION_RULES = [
    (re.compile(r"cps|cahier.*(prescription|sp[eé]cial)", re.I), "cps"),
    (re.compile(r"^rc[_\s\-]|r[eè]glement.*consult", re.I), "rc"),
    (re.compile(r"acte.*engagement|engagement", re.I), "acte_engagement"),
    (re.compile(r"bordereau|bpu|dpq|prix\s*unit", re.I), "bordereau_des_prix"),
    (re.compile(r"plan|ccag|cahier.*charge", re.I), "ccag"),
]

USER_AGENTS = [
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
]


def _classify(filename: str) -> str:
    name = filename.lower()
    for pattern, label in CLASSIFICATION_RULES:
        if pattern.search(name):
            return label
    return None


def _minio_client() -> Minio:
    return Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )


@celery_app.task(
    name="app.workers.tasks.download_tasks.download_ao_zip",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def download_ao_zip(self, ao_id: int) -> dict:
    log.info("Starting ZIP download", ao_id=ao_id)
    try:
        result = run_async(_download_and_classify(ao_id))
        log.info("ZIP download complete", ao_id=ao_id, result=result)
        return result
    except Exception as exc:
        log.error("ZIP download failed", ao_id=ao_id, error=str(exc))
        # Persist error to DB before retry
        run_async(_save_error(ao_id, str(exc)))
        raise self.retry(exc=exc)


async def _download_and_classify(ao_id: int) -> dict:
    async with task_db() as db:
        repo = AoRepository(db)
        ao = await repo.get_by_id(ao_id)

    if not ao or not ao.zip_url:
        raise ValueError(f"AO {ao_id} has no zip_url")

    headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "application/zip,application/octet-stream,*/*",
        "Referer": ao.url_source,
    }

    # Download — could be a form POST or direct GET
    content = await _fetch_document(ao.zip_url, ao.url_source, headers)
    if not content:
        raise ValueError("Empty response from download URL")

    # Classify and upload
    classified_docs = {}
    minio = _minio_client()

    if zipfile.is_zipfile(io.BytesIO(content)):
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            fallback_n = 1
            for name in zf.namelist():
                if name.endswith("/"):
                    continue
                label = _classify(name)
                if not label:
                    label = f"autre_doc_{fallback_n}"
                    fallback_n += 1
                file_data = zf.read(name)
                minio_key = f"ao-watcher/{ao_id}/{label}.pdf"
                minio.put_object(
                    settings.minio_bucket,
                    minio_key,
                    io.BytesIO(file_data),
                    length=len(file_data),
                    content_type="application/pdf",
                )
                classified_docs[label] = minio_key
                log.info("File uploaded", ao_id=ao_id, label=label, key=minio_key)
    else:
        # Single file (PDF or other)
        ext = ao.zip_url.split(".")[-1].lower() if "." in ao.zip_url else "pdf"
        label = _classify(ao.zip_url) or "dossier"
        minio_key = f"ao-watcher/{ao_id}/{label}.{ext}"
        minio.put_object(
            settings.minio_bucket,
            minio_key,
            io.BytesIO(content),
            length=len(content),
            content_type="application/octet-stream",
        )
        classified_docs[label] = minio_key

    # Update DB
    zip_minio_key = f"ao-watcher/{ao_id}/"
    async with task_db() as db:
        repo = AoRepository(db)
        await repo.update_zip_result(
            ao_id=ao_id,
            zip_minio_key=zip_minio_key,
            classified_docs=classified_docs,
            error=None,
        )

    return {"ao_id": ao_id, "files": list(classified_docs.keys())}


async def _fetch_document(zip_url: str, referer: str, headers: dict) -> bytes | None:
    """
    The DCE download page on MPE portals shows an optional contact form.
    We POST it with empty fields (anonymous download allowed).
    """
    async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=60) as client:
        # GET the download form page first to extract __VIEWSTATE
        resp = await client.get(zip_url)
        if resp.status_code != 200:
            return None

        soup = BeautifulSoup(resp.text, "html.parser")
        form = soup.find("form")

        if form:
            # Build form data from hidden inputs
            form_data = {}
            for inp in form.find_all("input"):
                name = inp.get("name", "")
                value = inp.get("value", "")
                if name:
                    form_data[name] = value

            # Submit form with empty contact fields (anonymous)
            action = form.get("action", zip_url)
            if not action.startswith("http"):
                from urllib.parse import urljoin
                action = urljoin(zip_url, action)

            post_resp = await client.post(action, data=form_data, headers={**headers, "Referer": zip_url})
            if post_resp.headers.get("content-type", "").startswith("application/"):
                return post_resp.content
            # Might redirect to actual file
            if post_resp.is_redirect:
                file_resp = await client.get(post_resp.headers["location"])
                return file_resp.content
            return post_resp.content

        # No form — try direct GET of the URL
        if resp.headers.get("content-type", "").startswith("application/"):
            return resp.content

    return None


async def _save_error(ao_id: int, error: str) -> None:
    async with task_db() as db:
        repo = AoRepository(db)
        await repo.update_zip_result(
            ao_id=ao_id,
            zip_minio_key=None,
            classified_docs=None,
            error=error,
        )
