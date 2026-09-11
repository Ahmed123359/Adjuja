#!/usr/bin/env python3
"""
filler_segmenter.py
-------------------
Segmentation d'un PDF multi-documents en blocs par type de document.
"""

import sys
from pathlib import Path

try:
    import fitz
except ImportError:
    sys.exit("Installer PyMuPDF : pip install PyMuPDF")

from app.services.filler.filler_page_detector import (
    _score_page_text,
    detect_pages_in_scanned_pdf,
    detect_pages_in_text_pdf,
)
from app.services.filler.filler_settings import (
    DOCUMENT_REGISTRY,
    PAGE_TITLE_KEYWORD_WEIGHT,
    SEGMENTATION_MIN_SCORE,
)


def _score_all_types(pdf_path: Path) -> dict[str, list[int]]:
    active_types = {
        dt: cfg
        for dt, cfg in DOCUMENT_REGISTRY.items()
        if cfg.get("action", "skip") != "skip"
    }

    doc    = fitz.open(str(pdf_path))
    total  = len(doc)
    texts  = [doc[i].get_text() for i in range(total)]
    doc.close()

    scores_by_type: dict[str, list[int]] = {}
    for doc_type, cfg in active_types.items():
        title_kws = cfg.get("title_keywords", [])
        body_kws  = cfg.get("body_keywords", [])
        scores_by_type[doc_type] = [
            _score_page_text(text, title_kws, body_kws) for text in texts
        ]

    return scores_by_type


def _resolve_page_ownership(
    scores_by_type: dict[str, list[int]],
    total_pages: int,
) -> dict[int, str]:
    ownership: dict[int, str] = {}
    for page_idx in range(total_pages):
        best_type  = None
        best_score = SEGMENTATION_MIN_SCORE - 1

        for doc_type, scores in scores_by_type.items():
            if page_idx < len(scores) and scores[page_idx] > best_score:
                best_score = scores[page_idx]
                best_type  = doc_type

        if best_type is not None:
            ownership[page_idx] = best_type

    return ownership


def _extend_blocks(
    ownership: dict[str, list[int]],
    scores_by_type: dict[str, list[int]],
    total_pages: int,
) -> dict[str, list[int]]:
    result: dict[str, list[int]] = {}

    for doc_type, scores in scores_by_type.items():
        if not scores:
            continue
        best_page = max(range(len(scores)), key=lambda i: scores[i])
        if scores[best_page] < SEGMENTATION_MIN_SCORE:
            continue

        start_page = best_page
        while start_page > 0 and scores[start_page - 1] >= 1:
            start_page -= 1

        max_pages = DOCUMENT_REGISTRY[doc_type].get("max_pages", 5)
        end       = min(start_page + max_pages, total_pages)
        result[doc_type] = list(range(start_page, end))

    _deduplicate(result, scores_by_type)
    return result


def _deduplicate(
    result: dict[str, list[int]],
    scores_by_type: dict[str, list[int]],
) -> None:
    page_claims: dict[int, list[str]] = {}
    for doc_type, pages in result.items():
        for p in pages:
            page_claims.setdefault(p, []).append(doc_type)

    for page_idx, claimants in page_claims.items():
        if len(claimants) <= 1:
            continue
        winner = max(
            claimants,
            key=lambda dt: scores_by_type.get(dt, [0])[page_idx]
            if page_idx < len(scores_by_type.get(dt, []))
            else 0,
        )
        for loser in claimants:
            if loser != winner and page_idx in result.get(loser, []):
                result[loser] = [p for p in result[loser] if p != page_idx]

    for dt in [dt for dt, pages in result.items() if not pages]:
        del result[dt]


def segment_document(pdf_path: Path, is_scanned: bool) -> dict[str, list[int]]:
    doc         = fitz.open(str(pdf_path))
    total_pages = len(doc)
    doc.close()

    active_types = [
        dt for dt, cfg in DOCUMENT_REGISTRY.items()
        if cfg.get("action", "skip") != "skip"
    ]

    if not is_scanned:
        scores_by_type = _score_all_types(pdf_path)
        result         = _extend_blocks(scores_by_type, scores_by_type, total_pages)
    else:
        result: dict[str, list[int]] = {}
        for doc_type in active_types:
            pages = detect_pages_in_scanned_pdf(pdf_path, doc_type)
            if pages:
                result[doc_type] = pages

        if result:
            fake_scores: dict[str, list[int]] = {}
            for doc_type, pages in result.items():
                scores = [0] * total_pages
                for p in pages:
                    scores[p] = 1
                fake_scores[doc_type] = scores
            _deduplicate(result, fake_scores)

    return result


def summarize_segmentation(segments: dict[str, list[int]], total_pages: int) -> None:
    assigned = {p for pages in segments.values() for p in pages}
    unknown  = total_pages - len(assigned)
    print(f"  Segmentation : {len(segments)} type(s) détecté(s) sur {total_pages} pages")
    for doc_type, pages in segments.items():
        action = DOCUMENT_REGISTRY.get(doc_type, {}).get("action", "?")
        print(f"    [{action:13s}] {doc_type:25s} → pages {[p + 1 for p in pages]}")
    if unknown > 0:
        print(f"    [skip        ] unknown                   → {unknown} page(s) non assignée(s)")
