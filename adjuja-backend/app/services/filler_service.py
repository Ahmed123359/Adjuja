"""
filler_service.py
-----------------
Couche service pour le remplissage automatique des dossiers AO.
Stockage des fichiers produits dans MinIO (plus de local tmp persistant).
"""

import asyncio
import logging
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.models.filler import FillerOutputFile, FillerResult

logger = logging.getLogger(__name__)

_CONTENT_TYPES = {
    ".pdf":  "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def _minio_key(org_id: str, job_id: str, filename: str, marche_id: str | None = None, ao_id: str | None = None) -> str:
    if ao_id:
        return f"{org_id}/ao/{ao_id}/filler/{job_id}/{filename}"
    if marche_id:
        return f"{org_id}/marches/{marche_id}/filler/{job_id}/{filename}"
    return f"{org_id}/filler/{job_id}/{filename}"


def _run_pipeline(
    pdf_path: Path,
    output_dir: Path,
    company_case: str,
    lots: list[int],
    api_key: str,
    company_info: dict | None = None,
) -> list[dict[str, Any]]:
    from app.services.filler.filler_orchestrator import run as orchestrator_run
    from app.services.filler import company_adapter

    # Injecter le company_info DB en override dans le module company_adapter
    if company_info:
        company_adapter._OVERRIDE = company_info

    profile = {
        "company_case": company_case,
        "lots":         lots or None,
        "output_dir":   str(output_dir),
    }

    try:
        results = orchestrator_run(pdf_path, profile, api_key, output_dir=output_dir)
    finally:
        company_adapter._OVERRIDE = None

    return [
        {
            "doc_type":    r.doc_type,
            "action":      r.action,
            "output_path": str(r.output_path) if r.output_path else None,
            "success":     r.success,
            "message":     r.message,
        }
        for r in results
    ]


def _upload_outputs(
    raw_results: list[dict[str, Any]],
    org_id: str,
    job_id: str,
    marche_id: str | None,
    ao_id: str | None = None,
) -> tuple[list[FillerOutputFile], list[str]]:
    from app.storage import minio_client as mc

    files:  list[FillerOutputFile] = []
    errors: list[str]              = []
    seen:   set[Path]              = set()

    for r in raw_results:
        if not r["success"]:
            errors.append(f"{r['doc_type']}: {r['message'].splitlines()[0]}")
            continue

        path = r.get("output_path")
        if not path:
            continue

        p = Path(path)
        candidates = [
            p.with_suffix(ext)
            for ext in (".pdf", ".docx", ".xlsx")
            if p.with_suffix(ext).exists() and p.with_suffix(ext) not in seen
        ]

        if not candidates:
            errors.append(f"{r['doc_type']}: fichier produit introuvable ({p.name})")
            continue

        for candidate in candidates:
            seen.add(candidate)
            ext = candidate.suffix.lower()
            fmt = {"pdf": "pdf", ".docx": "docx", ".xlsx": "excel"}.get(ext, ext.lstrip("."))
            content_type = _CONTENT_TYPES.get(ext, "application/octet-stream")
            key = _minio_key(org_id, job_id, candidate.name, marche_id, ao_id)

            try:
                mc.upload_file(key, str(candidate), content_type)
                url = mc.presigned_get(key)
                files.append(FillerOutputFile(
                    doc_type=r["doc_type"],
                    filename=candidate.name,
                    format=fmt,
                    download_url=url,
                    minio_key=key,
                ))
            except Exception as exc:
                logger.error("MinIO upload filler failed %s: %s", key, exc)
                errors.append(f"{r['doc_type']}: upload MinIO échoué")

    return files, errors


async def run_filler(
    pdf_bytes: bytes,
    filename: str,
    company_case: str,
    lots: list[int],
    api_key: str,
    org_id: str = "default",
    marche_id: str | None = None,
    ao_id: str | None = None,
    company_info: dict | None = None,
) -> FillerResult:
    job_id = uuid.uuid4().hex
    logger.info("Filler job=%s org=%s marche=%s file=%s case=%s lots=%s", job_id, org_id, marche_id, filename, company_case, lots)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        pdf_path = tmp_path / "input.pdf"
        out_dir  = tmp_path / "output"
        out_dir.mkdir()
        pdf_path.write_bytes(pdf_bytes)

        try:
            raw_results = await asyncio.to_thread(
                _run_pipeline,
                pdf_path,
                out_dir,
                company_case,
                lots,
                api_key,
                company_info,
            )
        except Exception as exc:
            logger.error("Filler job=%s failed: %s", job_id, exc, exc_info=True)
            return FillerResult(
                job_id=job_id,
                succes=False,
                erreurs=[str(exc)],
                message="Erreur inattendue lors du traitement.",
            )

        fichiers, erreurs = _upload_outputs(raw_results, org_id, job_id, marche_id, ao_id)

    if marche_id:
        await _save_filler_job(marche_id, org_id, job_id)

    succes  = len(fichiers) > 0
    message = (
        f"{len(fichiers)} fichier(s) produit(s)."
        if succes
        else "Aucun document rempli. Vérifiez le fichier PDF et les paramètres."
    )

    logger.info("Filler job=%s done: %d files, %d errors", job_id, len(fichiers), len(erreurs))

    return FillerResult(
        job_id=job_id,
        succes=succes,
        fichiers=fichiers,
        erreurs=erreurs,
        message=message,
    )


async def _save_filler_job(marche_id: str, org_id: str, job_id: str) -> None:
    from app.db.base import AsyncSessionLocal
    from app.db.models import FillerJob

    try:
        async with AsyncSessionLocal() as session:
            job = FillerJob(
                id=uuid.uuid4().hex,
                marche_id=marche_id,
                org_id=org_id,
                created_at=datetime.now(timezone.utc).isoformat(),
                job_id=job_id,
                statut="termine",
            )
            session.add(job)
            await session.commit()
    except Exception as exc:
        logger.warning("Impossible de sauvegarder FillerJob: %s", exc)
