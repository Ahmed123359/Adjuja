import asyncio
import logging
import tempfile
import uuid
from pathlib import Path

from app.models.offre_technique import OffreTechniqueOutputFile, OffreTechniqueResult, RCContext

logger = logging.getLogger(__name__)
_MAX_REGEN_ATTEMPTS = 2

_CONTENT_TYPES = {
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pdf":  "application/pdf",
    ".png":  "image/png",
}


def _minio_key(org_id: str, job_id: str, filename: str, marche_id: str | None = None) -> str:
    if marche_id:
        return f"{org_id}/marches/{marche_id}/offre_technique/{job_id}/{filename}"
    return f"{org_id}/outputs/{job_id}/{filename}"


def _run_pipeline(
    pdf_path: Path, output_dir: Path, api_key: str,
    logo_bytes: bytes | None, logo_filename: str | None,
    brand_color: str | None, custom_instructions: str | None,
    rc_pdf_path: Path | None = None,
) -> dict:
    from app.services.filler.company_adapter import get_company_info
    from app.services.offre_technique.cps_analyzer   import analyze
    from app.services.offre_technique.rc_analyzer    import analyze as analyze_rc
    from app.services.offre_technique.strategy_engine import choose_angle
    from app.services.offre_technique.quality_gate    import evaluate, find_weakest_section
    from app.services.offre_technique.doc_assembler   import build_docx, build_pdf

    company_info = get_company_info()
    cps   = analyze(pdf_path, api_key)
    rc: RCContext | None = analyze_rc(rc_pdf_path, api_key) if rc_pdf_path else None
    angle = choose_angle(cps, company_info, api_key)

    sections: dict[str, str] = {}
    report = None

    for attempt in range(_MAX_REGEN_ATTEMPTS + 1):
        new_sections = asyncio.run(
            _generate_sections(cps, angle, company_info, api_key, sections, custom_instructions, rc)
        )
        sections.update(new_sections)

        report = evaluate(sections, cps, angle, api_key)
        if report.approved:
            break

        weakest = find_weakest_section(sections, report)
        if not weakest or attempt == _MAX_REGEN_ATTEMPTS:
            break
        logger.info("Quality gate: regeneration '%s' (attempt %d)", weakest, attempt + 1)
        sections.pop(weakest, None)

    docx_path = output_dir / "offre_technique.docx"
    build_docx(
        sections, cps, company_info, docx_path,
        logo_bytes=logo_bytes, logo_filename=logo_filename,
        brand_color=brand_color,
    )
    pdf_path_out = build_pdf(docx_path)

    return {
        "docx":    docx_path if docx_path.exists() else None,
        "pdf":     pdf_path_out if pdf_path_out and Path(pdf_path_out).exists() else None,
        "quality": report.model_dump() if report else None,
    }


async def _generate_sections(
    cps, angle, company_info, api_key, existing: dict,
    custom_instructions: str | None = None,
    rc: RCContext | None = None,
) -> dict[str, str]:
    from app.services.offre_technique.section_generator import SECTION_NAMES
    from app.services.offre_technique import section_generator
    from app.services.rag_service import RagService
    from app.config.settings import get_settings

    missing = [s for s in SECTION_NAMES if s not in existing]
    if not missing:
        return {}

    settings = get_settings()
    rag = RagService(qdrant_url=settings.qdrant_url or "", mistral_api_key=api_key)
    rag_contexts: dict[str, str] = {}
    if rag.is_ready:
        raw = await asyncio.gather(
            *[rag.retrieve_for_ot_section(s, cps.scope) for s in missing],
            return_exceptions=True,
        )
        for section, ctx in zip(missing, raw):
            rag_contexts[section] = ctx if isinstance(ctx, str) else ""

    result = await section_generator.generate_all(
        cps, angle, company_info, api_key, rag_contexts, custom_instructions, rc
    )
    return {k: v for k, v in result.items() if k in missing}


async def run_offre_technique(
    pdf_bytes: bytes, filename: str, api_key: str,
    org_id: str = "default",
    logo_bytes: bytes | None = None, logo_filename: str | None = None,
    brand_color: str | None = None, custom_instructions: str | None = None,
    rc_bytes: bytes | None = None,
    marche_id: str | None = None,
    user_id: str | None = None,
) -> OffreTechniqueResult:
    job_id = uuid.uuid4().hex
    logger.info("OffreTechnique job=%s org=%s marche=%s file=%s", job_id, org_id, marche_id, filename)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path  = Path(tmp)
        pdf_path  = tmp_path / "input.pdf"
        out_dir   = tmp_path / "output"
        out_dir.mkdir()
        pdf_path.write_bytes(pdf_bytes)

        rc_pdf_path: Path | None = None
        if rc_bytes:
            rc_pdf_path = tmp_path / "rc.pdf"
            rc_pdf_path.write_bytes(rc_bytes)

        try:
            result = await asyncio.to_thread(
                _run_pipeline, pdf_path, out_dir, api_key,
                logo_bytes, logo_filename, brand_color, custom_instructions,
                rc_pdf_path,
            )
        except Exception as exc:
            logger.error("OffreTechnique job=%s failed: %s", job_id, exc, exc_info=True)
            return OffreTechniqueResult(
                job_id=job_id, succes=False,
                erreurs=[str(exc)],
                message="Erreur inattendue lors du traitement.",
            )

        fichiers = _upload_outputs(result, org_id, job_id, marche_id)

    if marche_id:
        await _save_offre_technique_job(marche_id, org_id, job_id)

    from app.models.offre_technique import QualityReport
    quality = QualityReport(**result["quality"]) if result.get("quality") else None
    succes  = len(fichiers) > 0
    message = f"{len(fichiers)} fichier(s) produit(s)." if succes else "Aucun document généré."

    logger.info("OffreTechnique job=%s done: %d files", job_id, len(fichiers))
    return OffreTechniqueResult(
        job_id=job_id, succes=succes,
        fichiers=fichiers, quality=quality,
        message=message,
    )


async def _save_offre_technique_job(marche_id: str, org_id: str, job_id: str) -> None:
    from datetime import datetime, timezone
    from app.db.base import AsyncSessionLocal
    from app.db.models import OffreTechniqueJob

    try:
        async with AsyncSessionLocal() as session:
            job = OffreTechniqueJob(
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
        logger.warning("Impossible de sauvegarder OffreTechniqueJob: %s", exc)


def _upload_outputs(result: dict, org_id: str, job_id: str, marche_id: str | None = None) -> list[OffreTechniqueOutputFile]:
    from app.storage import minio_client as mc

    fichiers: list[OffreTechniqueOutputFile] = []

    for field, fname in [("docx", "offre_technique.docx"), ("pdf", "offre_technique.pdf")]:
        local = result.get(field)
        if not local:
            continue
        local_path = Path(local)
        if not local_path.exists():
            continue
        suffix = local_path.suffix
        key = _minio_key(org_id, job_id, fname, marche_id)
        try:
            mc.upload_file(key, str(local_path), _CONTENT_TYPES.get(suffix, "application/octet-stream"))
            url = mc.presigned_get(key)
            fichiers.append(OffreTechniqueOutputFile(
                filename=fname,
                format=suffix.lstrip("."),
                download_url=url,
                minio_key=key,
            ))
        except Exception as exc:
            logger.error("MinIO upload failed for %s: %s", key, exc)

    return fichiers


def get_presigned_url(org_id: str, job_id: str, filename: str, marche_id: str | None = None) -> str | None:
    from app.storage import minio_client as mc
    try:
        key = _minio_key(org_id, job_id, filename, marche_id)
        return mc.presigned_get(key)
    except Exception:
        return None
