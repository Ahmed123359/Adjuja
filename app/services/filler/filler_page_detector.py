#!/usr/bin/env python3
"""
filler_page_detector.py
-----------------------
Détection intelligente des pages pertinentes dans un document multi-pages.
Stratégie en 4 couches (keyword scoring → OCR headers → fallback → all pages).
"""

import re
import sys
from pathlib import Path
from typing import Any

try:
    import fitz
except ImportError:
    sys.exit("Installer PyMuPDF : pip install PyMuPDF")

from app.services.filler.filler_settings import (
    DETECTION_LOW_DPI,
    DETECTION_OCR_LANG,
    DOCUMENT_REGISTRY,
    FALLBACK_FIRST_N_PAGES,
    PAGE_DETECTION_MIN_SCORE,
    PAGE_TITLE_KEYWORD_WEIGHT,
)

DetectionResult = tuple[list[int], str]


def _score_page_text(text: str, title_keywords: list[str], body_keywords: list[str]) -> int:
    normalized = text.lower()
    title_score = sum(PAGE_TITLE_KEYWORD_WEIGHT for kw in title_keywords if kw.lower() in normalized)
    body_score  = sum(1 for kw in body_keywords if kw.lower() in normalized)
    return title_score + body_score


def detect_pages_in_text_pdf(pdf_path: Path, doc_type: str) -> list[int]:
    registry  = DOCUMENT_REGISTRY.get(doc_type, {})
    title_kws = registry.get("title_keywords", [])
    body_kws  = registry.get("body_keywords", [])
    max_pages = registry.get("max_pages", 5)

    doc    = fitz.open(str(pdf_path))
    total  = len(doc)
    scores = [_score_page_text(doc[i].get_text(), title_kws, body_kws) for i in range(total)]
    doc.close()

    best_idx   = max(range(total), key=lambda i: scores[i])
    best_score = scores[best_idx]

    if best_score < PAGE_DETECTION_MIN_SCORE:
        return []

    end = min(best_idx + max_pages, total)
    return list(range(best_idx, end))


def _crop_header(img: Any, search_zone: float) -> Any:
    w, h = img.size
    return img.crop((0, 0, w, int(h * search_zone)))


def detect_pages_in_scanned_pdf(pdf_path: Path, doc_type: str) -> list[int]:
    try:
        import pytesseract
        from pdf2image import convert_from_path
    except ImportError:
        return []

    registry    = DOCUMENT_REGISTRY.get(doc_type, {})
    title_kws   = registry.get("title_keywords", [])
    max_pages   = registry.get("max_pages", 5)
    search_zone = registry.get("search_zone", 0.25)

    if not title_kws:
        return []

    images = convert_from_path(str(pdf_path), dpi=DETECTION_LOW_DPI)
    matching_pages: list[int] = []

    for i, img in enumerate(images):
        header = _crop_header(img, search_zone)
        try:
            ocr_text = pytesseract.image_to_string(
                header, lang=DETECTION_OCR_LANG, config="--psm 6"
            ).lower()
        except Exception:
            continue
        if any(kw.lower() in ocr_text for kw in title_kws):
            matching_pages.append(i)

    if not matching_pages:
        return []

    start = matching_pages[0]
    end   = min(start + max_pages, len(images))
    return list(range(start, end))


def _fallback_first_pages(pdf_path: Path) -> list[int]:
    doc   = fitz.open(str(pdf_path))
    total = len(doc)
    doc.close()
    return list(range(min(FALLBACK_FIRST_N_PAGES, total)))


def find_document_pages(
    pdf_path: Path,
    doc_type: str,
    is_scanned: bool,
) -> DetectionResult:
    doc   = fitz.open(str(pdf_path))
    total = len(doc)
    doc.close()

    if doc_type == "unknown":
        print(f"  [WARN] Type inconnu : fallback sur les {FALLBACK_FIRST_N_PAGES} premières pages.")
        return _fallback_first_pages(pdf_path), "layer3_fallback"

    if not is_scanned:
        pages = detect_pages_in_text_pdf(pdf_path, doc_type)
        if pages:
            return pages, "layer1_text"
    else:
        pages = detect_pages_in_scanned_pdf(pdf_path, doc_type)
        if pages:
            return pages, "layer2_scanned_header"

    print(
        f"  [WARN] Détection ciblée échouée pour '{doc_type}'. "
        f"Fallback sur les {FALLBACK_FIRST_N_PAGES} premières pages."
    )
    return _fallback_first_pages(pdf_path), "layer3_fallback"


def summarize_detection(pages: list[int], method: str, total_pages: int) -> None:
    saved     = total_pages - len(pages)
    pct_saved = int(saved / max(total_pages, 1) * 100)
    method_labels = {
        "layer1_text":           "Couche 1 : scoring texte",
        "layer2_scanned_header": "Couche 2 : OCR en-tête basse résolution",
        "layer3_fallback":       "Couche 3 : fallback heuristique",
        "layer4_all_pages":      "Couche 4 : toutes les pages",
    }
    print(f"  Détection : {method_labels.get(method, method)}")
    print(f"  Pages sélectionnées : {[p + 1 for p in pages]} sur {total_pages} ({pct_saved}% économisés)")
