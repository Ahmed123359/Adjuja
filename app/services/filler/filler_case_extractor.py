#!/usr/bin/env python3
"""
filler_case_extractor.py
------------------------
Extraction d'un cas juridique spécifique depuis un document multi-cas.
"""

import re
import sys
from pathlib import Path
from typing import Any

try:
    import fitz
except ImportError:
    sys.exit("Installer PyMuPDF : pip install PyMuPDF")

from app.services.filler.filler_placeholders import has_placeholder
from app.services.filler.filler_settings import CASE_REGISTRY, LOT_REGISTRY

Block = dict[str, Any]


def _extract_blocks(pdf_path: Path, pages: list[int]) -> list[Block]:
    doc    = fitz.open(str(pdf_path))
    blocks: list[Block] = []

    for page_no in pages:
        page = doc[page_no]
        for blk in page.get_text("dict")["blocks"]:
            if blk.get("type") != 0:
                continue
            lines = blk.get("lines", [])
            if not lines:
                continue

            if len(lines) <= 3:
                all_spans = [
                    span
                    for line in lines
                    for span in line.get("spans", [])
                    if span.get("text", "").strip()
                ]
                if not all_spans:
                    continue
                text     = "".join(s["text"] for s in all_spans).strip()
                if not text:
                    continue
                avg_size = sum(s.get("size", 10.0) for s in all_spans) / len(all_spans)
                is_bold  = any(s.get("flags", 0) & 16 for s in all_spans)
                blocks.append({
                    "text": text, "page_no": page_no,
                    "bbox": blk["bbox"], "font_size": avg_size, "is_bold": is_bold,
                })
            else:
                for line in lines:
                    spans = [s for s in line.get("spans", []) if s.get("text", "").strip()]
                    if not spans:
                        continue
                    text     = "".join(s["text"] for s in spans).strip()
                    if not text:
                        continue
                    avg_size = sum(s.get("size", 10.0) for s in spans) / len(spans)
                    is_bold  = any(s.get("flags", 0) & 16 for s in spans)
                    line_bbox = line.get("bbox", blk["bbox"])
                    blocks.append({
                        "text": text, "page_no": page_no,
                        "bbox": line_bbox, "font_size": avg_size, "is_bold": is_bold,
                    })

    doc.close()
    return blocks


def _classify_block(block: Block) -> str:
    text = block["text"].strip()
    size = block["font_size"]
    bold = block["is_bold"]

    if text.startswith(("-", "•", "–", "*")) and len(text) < 200:
        return "bullet"
    if re.match(r"^[A-Z]\s*[-–]\s*.{3,}", text) and len(text) < 150:
        return "heading"
    if re.match(r"^\d+\)\s*Cas\s+", text) and len(text) < 120:
        return "subhead"
    if size >= 12 or (text.isupper() and len(text) < 80 and size >= 10):
        return "title"
    if bold or (text.isupper() and size >= 9):
        return "heading"
    return "body"


def _find_first_match(blocks: list[Block], keywords: list[str], start: int = 0) -> int | None:
    for i in range(start, len(blocks)):
        text_lower = blocks[i]["text"].lower()
        if any(kw.lower() in text_lower for kw in keywords):
            return i
    return None


def _header_end_index(blocks: list[Block], doc_type: str) -> int:
    all_case_start_kws = [
        kw
        for case_cfg in CASE_REGISTRY.get(doc_type, {}).values()
        for kw in case_cfg.get("start_keywords", [])
    ]
    if not all_case_start_kws:
        return 0
    idx = _find_first_match(blocks, all_case_start_kws)
    return idx if idx is not None else 0


def _case_boundaries(
    blocks: list[Block],
    doc_type: str,
    case_name: str,
    search_from: int = 0,
) -> tuple[int, int]:
    case_cfg  = CASE_REGISTRY.get(doc_type, {}).get(case_name, {})
    start_kws = case_cfg.get("start_keywords", [])
    end_kws   = case_cfg.get("end_keywords", [])

    start_idx = _find_first_match(blocks, start_kws, start=search_from)
    if start_idx is None:
        return search_from, len(blocks)

    if not end_kws:
        return start_idx, len(blocks)

    end_idx = _find_first_match(blocks, end_kws, start=start_idx + 1)
    return start_idx, (end_idx if end_idx is not None else len(blocks))


def _find_lot_header(blocks: list[Block], lot_number: int) -> str | None:
    lot_pat      = re.compile(LOT_REGISTRY["lot_pattern"])
    search_limit = LOT_REGISTRY.get("lot_header_search_blocks", 5)

    for blk in blocks[:search_limit + 10]:
        match = lot_pat.search(blk["text"])
        if match and int(match.group(1)) == lot_number:
            return blk["text"]
    return None


def extract_for_fill(
    pdf_path: Path,
    pages: list[int],
    doc_type: str,
    case_name: str,
    lot_number: int | None = None,
) -> tuple[list[dict], list[dict], list[Block], dict[str, int]]:
    all_blocks = _extract_blocks(pdf_path, pages)
    if not all_blocks:
        return [], [], [], {}

    header_end  = _header_end_index(all_blocks, doc_type)
    header_blks = all_blocks[:header_end]

    header_paragraphs: list[dict] = [
        {"type": _classify_block(b), "text": b["text"]}
        for b in header_blks
    ]

    if lot_number is not None:
        lot_header = _find_lot_header(all_blocks, lot_number)
        if lot_header:
            if not any(lot_header == p["text"] for p in header_paragraphs):
                header_paragraphs.insert(0, {"type": "heading", "text": lot_header})

    case_start, case_end = _case_boundaries(all_blocks, doc_type, case_name, header_end)
    case_blocks = all_blocks[case_start:case_end]

    line_items:      list[dict]     = []
    block_index_map: dict[str, int] = {}

    for idx, blk in enumerate(case_blocks):
        if has_placeholder(blk["text"]):
            line_id = f"case_{idx}"
            line_items.append({"id": line_id, "text": blk["text"]})
            block_index_map[line_id] = idx

    return header_paragraphs, line_items, case_blocks, block_index_map


def apply_fills_to_case(
    case_blocks: list[Block],
    filled_lines: dict[str, str],
    block_index_map: dict[str, int],
) -> list[dict]:
    result = [dict(b) for b in case_blocks]

    for line_id, filled_text in filled_lines.items():
        idx = block_index_map.get(line_id)
        if idx is not None and filled_text:
            result[idx]["text"] = filled_text

    return [
        {"type": _classify_block(b), "text": b["text"]}
        for b in result
    ]
