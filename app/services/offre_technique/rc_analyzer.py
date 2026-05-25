import json
import logging
import re
import time
from pathlib import Path

import pymupdf
import requests

from app.models.offre_technique import RCContext
from app.services.offre_technique.prompts import RC_EXTRACT_SYSTEM

logger = logging.getLogger(__name__)

_MISTRAL_URL  = "https://api.mistral.ai/v1/chat/completions"
_MODEL        = "mistral-small-latest"
_MAX_CHARS    = 40_000
_RETRY_DELAYS = (10, 30, 60)


def analyze(pdf_path: Path, api_key: str) -> RCContext:
    doc  = pymupdf.open(str(pdf_path))
    text = "\n".join(page.get_text() for page in doc)
    doc.close()
    text = text[:_MAX_CHARS]

    payload = {
        "model":           _MODEL,
        "messages":        [
            {"role": "system", "content": RC_EXTRACT_SYSTEM},
            {"role": "user",   "content": f"<user_content>\n{text}\n</user_content>"},
        ],
        "temperature":     0,
        "response_format": {"type": "json_object"},
    }
    for attempt, delay in enumerate((*_RETRY_DELAYS, None), start=1):
        resp = requests.post(
            _MISTRAL_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
            timeout=60,
        )
        if resp.status_code != 429 or delay is None:
            break
        logger.warning("RC analyzer 429 - attente %ds (tentative %d)", delay, attempt)
        time.sleep(delay)
    resp.raise_for_status()
    raw = resp.json()["choices"][0]["message"]["content"]

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
