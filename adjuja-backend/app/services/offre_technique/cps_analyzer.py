import json
import logging
import re
import time
from pathlib import Path

import pymupdf
import requests

from app.models.offre_technique import CPSContext
from app.services.offre_technique.prompts import CPS_EXTRACT_SYSTEM

logger = logging.getLogger(__name__)

_MISTRAL_URL   = "https://api.mistral.ai/v1/chat/completions"
_MODEL         = "mistral-small-latest"
_MAX_CHARS     = 40_000
_RETRY_DELAYS  = (10, 30, 60)


def extract_text(pdf_path: Path) -> str:
    doc  = pymupdf.open(str(pdf_path))
    text = "\n".join(page.get_text() for page in doc)
    doc.close()
    return text[:_MAX_CHARS]


def analyze(pdf_path: Path, api_key: str) -> CPSContext:
    from app.cache import cache
    from app.config.settings import get_settings

    raw_bytes = pdf_path.read_bytes()
    cache_key = f"cache:cps:{cache.sha256(raw_bytes)}"
    cached = cache.get(cache_key)
    if cached:
        logger.info("CPS cache hit: %s", cache_key[:24])
        return CPSContext(**cached)

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
    for attempt, delay in enumerate((*_RETRY_DELAYS, None), start=1):
        resp = requests.post(
            _MISTRAL_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
            timeout=60,
        )
        if resp.status_code != 429 or delay is None:
            break
        logger.warning("CPS analyzer 429  attente %ds (tentative %d)", delay, attempt)
        time.sleep(delay)
    resp.raise_for_status()
    raw = resp.json()["choices"][0]["message"]["content"]

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        data = json.loads(m.group(0)) if m else {}

    ctx = CPSContext(
        scope=data.get("scope", ""),
        acheteur=data.get("acheteur", ""),
        reference=data.get("reference", ""),
        delais=data.get("delais", ""),
        plan_rc=data.get("plan_rc", ""),
        criteres=data.get("criteres", []),
        lots=data.get("lots", []),
        nb_sessions=data.get("nb_sessions", ""),
        horaire=data.get("horaire", ""),
        livrables=data.get("livrables", []),
        exigences_formateurs=data.get("exigences_formateurs", ""),
        planning_note=data.get("planning_note", ""),
        sous_traitance=data.get("sous_traitance", ""),
    )
    cache.set(cache_key, ctx.model_dump())
    return ctx
