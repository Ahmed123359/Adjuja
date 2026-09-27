# -*- coding: utf-8 -*-
"""
OCR des CPS/RC scannes, par Tesseract (2026-09-27).

Mesure du 2026-09-27 : sur 5 AO dont les documents sont telecharges, 4 ont un
CPS et un RC entierement scannes (une image par page, 0 caractere de texte).
L'analyse ne pouvait rien en tirer. Ici :

- chaque page est rendue en niveaux de gris par PyMuPDF puis lue par
  `tesseract` en ligne de commande (francais), quelques pages en parallele ;
- le texte est mis en cache sur MinIO a cote du PDF (`<cle>.ocr.txt`) : un
  document n'est lu qu'une fois, quel que soit le nombre d'analyses ;
- rien ici n'appelle de service externe : les documents ne quittent pas
  l'infrastructure.

L'OCR prend plusieurs secondes par page : il tourne dans une tache Celery
(`app/workers/tasks/ocr_tasks.py`), jamais dans une requete HTTP.
"""

from __future__ import annotations

import io
import os
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor
from typing import Callable

import fitz
import structlog

log = structlog.get_logger(__name__)

# 300 dpi : en dessous, les caracteres fins des CPS (notes, tableaux) sont mal
# lus ; au-dessus, le temps double sans gain mesurable.
DPI = 300
LANGUE = "fra"
# Pages traitees en parallele. Tesseract est mono-thread par page quand
# OMP_THREAD_LIMIT=1 ; au-dela du nombre de coeurs, rien ne se gagne.
PARALLELE = max(1, min(4, (os.cpu_count() or 2) - 1))
TIMEOUT_PAGE_S = 120
SUFFIXE_CACHE = ".ocr.txt"
# En dessous, on considere qu'un PDF n'a pas de couche texte exploitable.
SEUIL_TEXTE = 200


def ocr_disponible() -> bool:
    return shutil.which("tesseract") is not None


def cle_cache(minio_key: str) -> str:
    return minio_key + SUFFIXE_CACHE


def lire_cache(minio, bucket: str, minio_key: str) -> str | None:
    """Texte OCR deja calcule pour ce document, ou None."""
    resp = None
    try:
        resp = minio.get_object(bucket, cle_cache(minio_key))
        return resp.read().decode("utf-8")
    except Exception:
        return None
    finally:
        if resp is not None:
            resp.close()
            resp.release_conn()


def ecrire_cache(minio, bucket: str, minio_key: str, texte: str) -> None:
    data = texte.encode("utf-8")
    minio.put_object(
        bucket, cle_cache(minio_key), io.BytesIO(data), length=len(data),
        content_type="text/plain; charset=utf-8",
    )


def texte_natif(pdf_bytes: bytes) -> tuple[str, int]:
    """(texte de la couche texte, nombre de pages)."""
    with fitz.open(stream=pdf_bytes, filetype="pdf") as pdf:
        return "".join(p.get_text() for p in pdf), len(pdf)


def _ocr_image(png: bytes) -> str:
    env = {**os.environ, "OMP_THREAD_LIMIT": "1"}
    res = subprocess.run(
        ["tesseract", "stdin", "stdout", "-l", LANGUE, "--psm", "3"],
        input=png, capture_output=True, timeout=TIMEOUT_PAGE_S, env=env, check=False,
    )
    if res.returncode != 0:
        raise RuntimeError(res.stderr.decode("utf-8", "replace")[:300])
    return res.stdout.decode("utf-8", "replace")


def ocr_pdf(pdf_bytes: bytes, on_page: Callable[[], None] | None = None) -> str:
    """Texte OCR de toutes les pages, dans l'ordre. `on_page` est appele apres
    chaque page lue (suivi de progression)."""
    with fitz.open(stream=pdf_bytes, filetype="pdf") as pdf:
        images = [
            page.get_pixmap(dpi=DPI, colorspace=fitz.csGRAY).tobytes("png")
            for page in pdf
        ]

    def lire(png: bytes) -> str:
        try:
            return _ocr_image(png)
        finally:
            if on_page:
                on_page()

    with ThreadPoolExecutor(max_workers=PARALLELE) as pool:
        pages = list(pool.map(lire, images))
    return "\n\n".join(f"--- page {i} ---\n{t.strip()}" for i, t in enumerate(pages, 1))
