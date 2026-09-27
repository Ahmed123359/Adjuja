"""
OCR des documents scannes du pipeline, par Tesseract (2026-09-27).

Meme approche que la veille (`adjuja-watcher/app/modules/ao_scraper/ocr.py`) :
pages rendues en niveaux de gris a 300 dpi par PyMuPDF, lues par `tesseract`
en ligne de commande (francais, deja installe dans l'image du backend), texte
mis en cache sur MinIO a cote du document (`<cle>.ocr.txt`) pour ne lire
chaque document qu'une fois.

Appele depuis la tache Celery d'analyse (`task_analyze_ao_context`) : l'OCR y
prend quelques minutes sur un gros CPS scanne sans bloquer personne.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor

import fitz

from app.storage import minio_client as mc

logger = logging.getLogger(__name__)

DPI = 300
LANGUE = "fra"
PARALLELE = max(1, min(4, (os.cpu_count() or 2) - 1))
TIMEOUT_PAGE_S = 120
SUFFIXE_CACHE = ".ocr.txt"
# En dessous, le document est considere sans couche texte exploitable.
SEUIL_TEXTE = 200


def ocr_disponible() -> bool:
    return shutil.which("tesseract") is not None


def _ocr_image(png: bytes) -> str:
    env = {**os.environ, "OMP_THREAD_LIMIT": "1"}
    res = subprocess.run(
        ["tesseract", "stdin", "stdout", "-l", LANGUE, "--psm", "3"],
        input=png, capture_output=True, timeout=TIMEOUT_PAGE_S, env=env, check=False,
    )
    if res.returncode != 0:
        raise RuntimeError(res.stderr.decode("utf-8", "replace")[:300])
    return res.stdout.decode("utf-8", "replace")


def ocr_pdf(pdf_bytes: bytes) -> str:
    with fitz.open(stream=pdf_bytes, filetype="pdf") as pdf:
        images = [p.get_pixmap(dpi=DPI, colorspace=fitz.csGRAY).tobytes("png") for p in pdf]
    with ThreadPoolExecutor(max_workers=PARALLELE) as pool:
        pages = list(pool.map(_ocr_image, images))
    return "\n\n".join(f"--- page {i} ---\n{t.strip()}" for i, t in enumerate(pages, 1))


def texte_document(minio_key: str, pdf_bytes: bytes) -> str:
    """Texte d'un PDF : couche texte si elle existe, sinon OCR (cache MinIO)."""
    with fitz.open(stream=pdf_bytes, filetype="pdf") as pdf:
        texte = "".join(p.get_text() for p in pdf)
    if len(texte.strip()) >= SEUIL_TEXTE or not ocr_disponible():
        return texte

    cle = minio_key + SUFFIXE_CACHE
    try:
        return mc.get_file_bytes(cle).decode("utf-8")
    except Exception:
        pass

    logger.info("[ocr] document scanne, lecture OCR key=%s", minio_key)
    lu = ocr_pdf(pdf_bytes)
    try:
        mc.upload_bytes(cle, lu.encode("utf-8"), "text/plain; charset=utf-8")
    except Exception as exc:
        logger.warning("[ocr] cache non ecrit key=%s : %s", cle, exc)
    logger.info("[ocr] termine key=%s caracteres=%d", minio_key, len(lu))
    return lu
