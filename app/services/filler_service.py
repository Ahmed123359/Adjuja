"""
filler_service.py
-----------------
Couche service pour le remplissage automatique des dossiers AO.

Responsabilités :
    - Recevoir les bytes PDF + paramètres en entrée
    - Sauvegarder le PDF dans un répertoire temporaire isolé par job_id
    - Appeler filler_orchestrator.run() dans un thread (opération synchrone et longue)
    - Collecter les fichiers produits et construire la réponse FillerResult
    - Planifier le nettoyage automatique des fichiers temporaires

Le pipeline de remplissage peut prendre 30–90 secondes selon la taille du PDF
et le nombre de documents détectés. asyncio.to_thread() évite de bloquer la
boucle d'événements FastAPI.

Architecture de stockage :
    data/filler_tmp/<job_id>/
        input.pdf           — PDF source
        <doc_type>/         — fichiers produits par l'orchestrateur
            acte_engagement_societe_filled.pdf
            acte_engagement_societe_filled.docx
            bordereau_prix.xlsx
            ...
"""

import asyncio
import logging
import shutil
import uuid
from pathlib import Path
from typing import Any

from app.models.filler import FillerOutputFile, FillerResult

logger = logging.getLogger(__name__)

# Racine du stockage temporaire, relative au projet
_TMP_ROOT = Path(__file__).parent.parent / "data" / "filler_tmp"


def _build_job_dir(job_id: str) -> Path:
    job_dir = _TMP_ROOT / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    return job_dir


def _run_pipeline(
    pdf_path: Path,
    output_dir: Path,
    company_case: str,
    lots: list[int],
    api_key: str,
) -> list[dict[str, Any]]:
    """
    Appel synchrone au pipeline de remplissage (exécuté dans un thread).

    Returns:
        Liste de dicts sérialisables issus de ProcessingResult.
    """
    from app.services.filler.filler_orchestrator import run as orchestrator_run

    profile = {
        "company_case": company_case,
        "lots":         lots or None,
        "output_dir":   str(output_dir),
    }

    results = orchestrator_run(pdf_path, profile, api_key, output_dir=output_dir)

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


def _collect_output_files(job_id: str, results: list[dict[str, Any]]) -> tuple[list[FillerOutputFile], list[str]]:
    """Transforme les résultats de l'orchestrateur en FillerOutputFile.

    Pour chaque résultat, collecte le fichier principal ET les fichiers
    compagnons de même nom mais d'extension différente (ex: .pdf + .docx
    produits tous les deux par _write_case_outputs).
    """
    files:  list[FillerOutputFile] = []
    errors: list[str]              = []
    seen:   set[Path]              = set()

    for r in results:
        if not r["success"]:
            errors.append(f"{r['doc_type']}: {r['message'].splitlines()[0]}")
            continue

        path = r.get("output_path")
        if not path:
            continue

        p = Path(path)

        # Cherche le fichier principal ET tous ses compagnons (même stem, extension différente).
        # _write_case_outputs produit systématiquement un .docx ET un .pdf : on veut les deux.
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
            ext = candidate.suffix.lstrip(".").lower()
            fmt = {"pdf": "pdf", "docx": "docx", "xlsx": "excel"}.get(ext, ext)
            files.append(FillerOutputFile(
                doc_type=r["doc_type"],
                filename=candidate.name,
                format=fmt,
                download_url=f"/api/v1/filler/download/{job_id}/{candidate.name}",
            ))

    return files, errors


async def run_filler(
    pdf_bytes: bytes,
    filename: str,
    company_case: str,
    lots: list[int],
    api_key: str,
) -> FillerResult:
    """
    Lance le pipeline de remplissage de manière asynchrone.

    Args:
        pdf_bytes    : Contenu binaire du PDF uploadé.
        filename     : Nom d'origine du fichier (pour le logging).
        company_case : Variante juridique ("societe", "personne_physique", ...).
        lots         : Numéros de lots à traiter (vide = tous).
        api_key      : Clé API Mistral.

    Returns:
        FillerResult avec les fichiers produits ou les erreurs.
    """
    job_id  = uuid.uuid4().hex
    job_dir = _build_job_dir(job_id)
    pdf_path = job_dir / "input.pdf"
    out_dir  = job_dir / "output"
    out_dir.mkdir(exist_ok=True)

    # Sauvegarder le PDF uploadé
    pdf_path.write_bytes(pdf_bytes)
    logger.info("Filler job=%s file=%s case=%s lots=%s", job_id, filename, company_case, lots)

    try:
        raw_results = await asyncio.to_thread(
            _run_pipeline,
            pdf_path,
            out_dir,
            company_case,
            lots,
            api_key,
        )
    except Exception as exc:
        logger.error("Filler job=%s failed: %s", job_id, exc, exc_info=True)
        return FillerResult(
            job_id=job_id,
            succes=False,
            erreurs=[str(exc)],
            message="Erreur inattendue lors du traitement.",
        )

    fichiers, erreurs = _collect_output_files(job_id, raw_results)
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


def get_output_file_path(job_id: str, filename: str) -> Path | None:
    """
    Résout le chemin d'un fichier produit pour le téléchargement.

    Returns:
        Chemin absolu si le fichier existe, None sinon.
    """
    candidate = _TMP_ROOT / job_id / "output" / filename
    return candidate if candidate.exists() else None


def cleanup_job(job_id: str) -> None:
    """Supprime le répertoire temporaire d'un job terminé."""
    job_dir = _TMP_ROOT / job_id
    if job_dir.exists():
        shutil.rmtree(job_dir, ignore_errors=True)
        logger.debug("Filler job=%s cleaned up", job_id)
