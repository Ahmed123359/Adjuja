import json
import logging
import re
from pathlib import Path

import pymupdf

from app.models.offre_technique import RCContext
from app.services.offre_technique.prompts import RC_EXTRACT_SYSTEM
from app.services.offre_technique.llm import appeler_sync

logger = logging.getLogger(__name__)

_MAX_CHARS    = 40_000
_RETRY_DELAYS = (10, 30, 60)


def analyze(pdf_path: Path, api_key: str) -> RCContext:
    doc  = pymupdf.open(str(pdf_path))
    text = "\n".join(page.get_text() for page in doc)
    doc.close()
    text = text[:_MAX_CHARS]

    # Role « fast » (LLM_FAST), relances 429 conservees (spec fournisseurs-ia).
    raw = appeler_sync(
        "fast", RC_EXTRACT_SYSTEM, f"<user_content>\n{text}\n</user_content>",
        temperature=0, max_tokens=4000, json_mode=True,
        retry_delays=_RETRY_DELAYS,
    )

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        data = json.loads(m.group(0)) if m else {}

    return RCContext(
        plan_impose=data.get("plan_impose", []),
        criteres=data.get("criteres", []),
        note_eliminatoire_globale=data.get("note_eliminatoire_globale", 0),
        format_cv=data.get("format_cv", ""),
        format_references=data.get("format_references", ""),
        nb_pages_max=data.get("nb_pages_max", {}),
        documents_obligatoires=data.get("documents_obligatoires", []),
    )
