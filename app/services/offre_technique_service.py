import asyncio
import logging
import shutil
import uuid
from pathlib import Path

from app.models.offre_technique import OffreTechniqueOutputFile, OffreTechniqueResult

logger  = logging.getLogger(__name__)
_TMP_ROOT = Path(__file__).parent.parent / "data" / "offre_technique_tmp"
_MAX_REGEN_ATTEMPTS = 2


def _build_job_dir(job_id: str) -> Path:
    d = _TMP_ROOT / job_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def _run_pipeline(pdf_path: Path, output_dir: Path, api_key: str) -> dict:
    """Synchronous pipeline — runs in a thread via asyncio.to_thread."""
    from app.services.filler.company_adapter import get_company_info
    from app.services.offre_technique.cps_analyzer   import analyze
    from app.services.offre_technique.strategy_engine import choose_angle
    from app.services.offre_technique.quality_gate    import evaluate, find_weakest_section
    from app.services.offre_technique.doc_assembler   import build_docx, build_pdf
    import asyncio

    company_info = get_company_info()

    # Phase 1 : analyse CPS
    cps = analyze(pdf_path, api_key)

    # Phase 2 : angle stratégique
    angle = choose_angle(cps, company_info, api_key)

    # Phase 3 + 4 : génération + quality gate avec max 2 tentatives
    sections: dict[str, str] = {}
    report = None

    for attempt in range(_MAX_REGEN_ATTEMPTS + 1):
        # section_generator est async — on le roule dans un nouveau event loop
        new_sections = asyncio.run(
            _generate_sections(cps, angle, company_info, api_key, sections)
        )
        sections.update(new_sections)

        report = evaluate(sections, cps, angle, api_key)
        if report.approved:
            break

        weakest = find_weakest_section(sections, report)
        if not weakest or attempt == _MAX_REGEN_ATTEMPTS:
            break
        logger.info("Quality gate: régénération ciblée de '%s' (tentative %d)", weakest, attempt + 1)
        sections.pop(weakest, None)

    # Phase 5 : assemblage
    docx_path = output_dir / "offre_technique.docx"
    build_docx(sections, cps, company_info, docx_path)
    pdf_path  = build_pdf(docx_path)

    return {
        "docx": str(docx_path),
        "pdf":  str(pdf_path) if pdf_path else None,
        "quality": report.model_dump() if report else None,
    }


async def _generate_sections(
    cps, angle, company_info, api_key, existing: dict
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
        logger.info("RAG contexts fetched for: %s", list(rag_contexts.keys()))

    result = await section_generator.generate_all(cps, angle, company_info, api_key, rag_contexts)
    return {k: v for k, v in result.items() if k in missing}


async def run_offre_technique(pdf_bytes: bytes, filename: str, api_key: str) -> OffreTechniqueResult:
    job_id   = uuid.uuid4().hex
    job_dir  = _build_job_dir(job_id)
    pdf_path = job_dir / "input.pdf"
    out_dir  = job_dir / "output"
    out_dir.mkdir(exist_ok=True)

    pdf_path.write_bytes(pdf_bytes)
    logger.info("OffreTechnique job=%s file=%s", job_id, filename)

    try:
        result = await asyncio.to_thread(_run_pipeline, pdf_path, out_dir, api_key)
    except Exception as exc:
        logger.error("OffreTechnique job=%s failed: %s", job_id, exc, exc_info=True)
        return OffreTechniqueResult(
            job_id=job_id, succes=False,
            erreurs=[str(exc)],
            message="Erreur inattendue lors du traitement.",
        )

    fichiers: list[OffreTechniqueOutputFile] = []
    if result["docx"] and Path(result["docx"]).exists():
        fichiers.append(OffreTechniqueOutputFile(
            filename="offre_technique.docx",
            format="docx",
            download_url=f"/api/v1/offre-technique/download/{job_id}/offre_technique.docx",
        ))
    if result["pdf"] and Path(result["pdf"]).exists():
        fichiers.append(OffreTechniqueOutputFile(
            filename="offre_technique.pdf",
            format="pdf",
            download_url=f"/api/v1/offre-technique/download/{job_id}/offre_technique.pdf",
        ))

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


def get_output_file_path(job_id: str, filename: str) -> Path | None:
    candidate = _TMP_ROOT / job_id / "output" / filename
    return candidate if candidate.exists() else None


def cleanup_job(job_id: str) -> None:
    job_dir = _TMP_ROOT / job_id
    if job_dir.exists():
        shutil.rmtree(job_dir, ignore_errors=True)
