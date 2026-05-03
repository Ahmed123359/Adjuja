import json
import re
from pathlib import Path

import pymupdf
import requests

from app.models.offre_technique import CPSContext
from app.services.offre_technique.prompts import CPS_EXTRACT_SYSTEM

_MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions"
_MODEL       = "mistral-small-latest"
_MAX_CHARS   = 40_000


def extract_text(pdf_path: Path) -> str:
    doc  = pymupdf.open(str(pdf_path))
    text = "\n".join(page.get_text() for page in doc)
    doc.close()
    return text[:_MAX_CHARS]


def analyze(pdf_path: Path, api_key: str) -> CPSContext:
    text = extract_text(pdf_path)

    payload = {
        "model":           _MODEL,
        "messages":        [
            {"role": "system", "content": CPS_EXTRACT_SYSTEM},
            {"role": "user",   "content": f"<user_content>\n{text}\n</user_content>"},
        ],
        "temperature":     0,
        "response_format": {"type": "json_object"},
    }
    resp = requests.post(
        _MISTRAL_URL,
        headers={"Authorization": f"Bearer {api_key}"},
        json=payload,
        timeout=60,
    )
    resp.raise_for_status()
    raw = resp.json()["choices"][0]["message"]["content"]

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        data = json.loads(m.group(0)) if m else {}

    return CPSContext(
        scope=data.get("scope", ""),
        acheteur=data.get("acheteur", ""),
        reference=data.get("reference", ""),
        delais=data.get("delais", ""),
        plan_rc=data.get("plan_rc", ""),
        criteres=data.get("criteres", []),
        lots=data.get("lots", []),
    )
