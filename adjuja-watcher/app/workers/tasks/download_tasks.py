import io
import re
import zipfile
from urllib.parse import parse_qs, urlparse

import structlog
from minio import Minio

from app.core.config import settings
from app.modules.ao_scraper.mpe import MPEPlatformScraper
from app.modules.ao_scraper.repository import AoRepository
from app.workers.celery_app import celery_app
from app.workers.utils import run_async, task_db

log = structlog.get_logger(__name__)

# Regles de classification, appliquees dans l'ordre : la premiere qui matche gagne.
#
# `rc` cherche le sigle comme MOT ISOLE, pas en debut de nom. L'ancienne regle
# etait ancree (`^rc[_\s\-]`) et ne reconnaissait donc que les fichiers dont le
# nom commence par "rc" -- sur un AO reel telecharge le 2026-09-12, elle ratait
# "AO 05-26 RC Formation 2026.pdf" et 5 fichiers sur 6 finissaient en autre_doc.
# Consequence en chaine : analysis.py lit docs.get("rc"), qui valait None, et
# l'analyse partait avec le seul CPS sans que rien ne le signale.
# Frontiere de mot, tolerante aux separateurs de fichiers ET de chemin : _classify
# recoit le chemin complet du membre dans le ZIP. Les DCE rangent leurs pieces dans
# un sous-dossier ("DCE_AOO-PM -2026-4865-VF/RC_AOO-PM ....pdf", vu en reel le
# 2026-09-13) : sans "/" comme frontiere, "RC" n'etait jamais reconnu.
_MOT = r"(?:^|[\s_\-.()\[\]/\\])"
_FIN = r"(?:$|[\s_\-.()\[\]/\\])"

CLASSIFICATION_RULES = [
    # Le CPS d'abord : "CPS" est plus specifique et certains noms portent les deux.
    # Volontairement NON ancre sur un mot : la version "mot isole" du 2026-09-13
    # a fait perdre le CPS d'un AO safakat reel dont le nom colle le sigle a
    # d'autres caracteres. Cette regle n'etait pas en faute, elle reste large.
    (re.compile(r"cps|cahier.*(prescription|sp[eé]cial)", re.I), "cps"),
    (re.compile(rf"{_MOT}rc{_FIN}|r[eè]glement.*consult", re.I), "rc"),
    (re.compile(r"acte.*engagement|{}ae{}".format(_MOT, _FIN), re.I), "acte_engagement"),
    # BOQ (bill of quantities) : nom reel du bordereau sur safakat, non reconnu avant.
    (re.compile(rf"bordereau|bpu|dpq|prix\s*unit|bpde|{_MOT}boq{_FIN}", re.I), "bordereau_des_prix"),
    # `plan` est conserve tel quel : trop large (il attrape "planning", "plan de
    # formation") mais le retirer changerait le classement d'AO deja traites.
    # Declare dans bugs-connus.md plutot que corrige au passage.
    (re.compile(r"plan|ccag|cahier.*charge", re.I), "ccag"),
    (re.compile(r"d[eé]claration.*honneur", re.I), "declaration_honneur"),
    (re.compile(rf"{_MOT}avis{_FIN}", re.I), "avis"),
]


def _classify(filename: str) -> str:
    name = filename.lower()
    for pattern, label in CLASSIFICATION_RULES:
        if pattern.search(name):
            return label
    return None


def _minio_client() -> Minio:
    client = Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )
    if not client.bucket_exists(settings.minio_bucket):
        client.make_bucket(settings.minio_bucket)
        log.info("MinIO bucket created", bucket=settings.minio_bucket)
    return client


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

    scraper = MPEPlatformScraper(ao.source)
    result = await scraper.download_document(ao.zip_url)
    if not result:
        raise ValueError("Empty response from download URL")
    content, filename = result

    # Classify and upload
    classified_docs = {}
    minio = _minio_client()

    if zipfile.is_zipfile(io.BytesIO(content)):
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            fallback_n = 1
            label_counts: dict[str, int] = {}
            for name in zf.namelist():
                base = name.rsplit("/", 1)[-1]
                if name.endswith("/") or base.startswith("~$") or base.startswith("~WRL") or base.lower().endswith(".tmp"):
                    continue
                label = _classify(name)
                if not label:
                    label = f"autre_doc_{fallback_n}"
                    fallback_n += 1
                else:
                    # Consultations multi-lots : plusieurs fichiers peuvent matcher le
                    # meme label (un CPS par lot) -- suffixer pour ne pas s'ecraser
                    # silencieusement sur la meme cle MinIO.
                    label_counts[label] = label_counts.get(label, 0) + 1
                    if label_counts[label] > 1:
                        label = f"{label}_{label_counts[label]}"
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
                # Le nom d'origine est perdu une fois le fichier stocke sous son label :
                # sans cette trace, impossible de verifier ou corriger une regle de
                # classement a partir des vrais noms (cas vecu le 2026-09-13).
                log.info("File uploaded", ao_id=ao_id, label=label, key=minio_key, original=name)
    else:
        # Single file (PDF or other)
        ext = filename.split(".")[-1].lower() if "." in filename else "pdf"
        label = _classify(filename) or "dossier"
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


@celery_app.task(
    name="app.workers.tasks.download_tasks.refresh_and_download_ao_zip",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
)
def refresh_and_download_ao_zip(self, ao_id: int) -> dict:
    """Le scraper n'enrichit une consultation qu'une seule fois, a sa
    decouverte -- si l'acheteur met en ligne le DCE plus tard, notre
    zip_url reste NULL indefiniment. Declenche quand l'utilisateur favorise
    une AO sans zip_url connu : re-visite la page de detail en direct avant
    de conclure qu'il n'y a vraiment rien a telecharger."""
    log.info("Refreshing AO detail before giving up on download", ao_id=ao_id)
    try:
        found = run_async(_refresh_zip_url(ao_id))
        if found:
            log.info("zip_url found on refresh, downloading", ao_id=ao_id)
            download_ao_zip.delay(ao_id)
        else:
            log.info("No zip_url on refresh either", ao_id=ao_id)
        return {"ao_id": ao_id, "zip_url_found": found}
    except Exception as exc:
        log.error("Refresh failed", ao_id=ao_id, error=str(exc))
        raise self.retry(exc=exc)


async def _refresh_zip_url(ao_id: int) -> bool:
    async with task_db() as db:
        repo = AoRepository(db)
        ao = await repo.get_by_id(ao_id)

    if not ao:
        raise ValueError(f"AO {ao_id} not found")
    if ao.zip_url:
        return True

    qs = parse_qs(urlparse(ao.url_source).query)
    org = qs.get("orgAcronyme", [""])[0]

    scraper = MPEPlatformScraper(ao.source)
    detail = await scraper.fetch_detail(ao.external_id, org)
    if not detail or not detail.zip_url:
        return False

    async with task_db() as db:
        repo = AoRepository(db)
        await repo.update_zip_url(ao_id, detail.zip_url)
    return True


async def _save_error(ao_id: int, error: str) -> None:
    async with task_db() as db:
        repo = AoRepository(db)
        await repo.update_zip_result(
            ao_id=ao_id,
            zip_minio_key=None,
            classified_docs=None,
            error=error,
        )
