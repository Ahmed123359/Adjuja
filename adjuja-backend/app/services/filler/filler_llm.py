#!/usr/bin/env python3
"""
filler_llm.py
-------------
Couche d'accès aux modèles LLM (Mistral texte + Pixtral vision).

Deux fonctions publiques :
    - call_mistral()        : pour les pipelines PDF texte et DOCX
    - call_pixtral_vision() : pour le pipeline PDF scanné

COMPANY_INFO est injecté dynamiquement via get_company_info() depuis
company_adapter.py au lieu d'être lu depuis un fichier statique.
"""

import base64
import json
import re
import time
from io import BytesIO
from typing import Any

import requests

from app.services.filler.prompts import TEXT_SYSTEM_PROMPT, get_vision_prompt
from app.services.filler.filler_settings import (
    API_URL,
    IMAGE_JPEG_QUALITY,
    IMAGE_MAX_SIDE_PX,
    RATE_LIMIT_BASE_WAIT_SECONDS,
    RATE_LIMIT_MAX_RETRIES,
    TEXT_LLM_TEMPERATURE,
    TEXT_LLM_TIMEOUT,
    TEXT_MODEL,
    VISION_LLM_MAX_TOKENS,
    VISION_LLM_TEMPERATURE,
    VISION_LLM_TIMEOUT,
    VISION_MODEL,
)


# ---------------------------------------------------------------------------
# Helpers internes
# ---------------------------------------------------------------------------

def _coerce_line_value(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("text", "filled_text", "value", "line", "content"):
            candidate = value.get(key)
            if isinstance(candidate, str):
                return candidate
        string_values = [v for v in value.values() if isinstance(v, str)]
        if len(string_values) == 1:
            return string_values[0]
    return None


def _normalize_filled_lines(payload: Any) -> dict[str, str]:
    if not isinstance(payload, dict):
        return {}
    normalized: dict[str, str] = {}
    for line_id, value in payload.items():
        text_value = _coerce_line_value(value)
        if text_value is not None:
            normalized[str(line_id)] = text_value
    return normalized


def _resize_for_api(img: Any) -> Any:
    w, h = img.size
    if max(w, h) <= IMAGE_MAX_SIDE_PX:
        return img
    scale = IMAGE_MAX_SIDE_PX / max(w, h)
    return img.resize((int(w * scale), int(h * scale)))


def _post_with_retry(payload: dict[str, Any], api_key: str) -> dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    timeout = payload.get("_timeout", TEXT_LLM_TIMEOUT)
    clean_payload = {k: v for k, v in payload.items() if k != "_timeout"}

    for attempt in range(RATE_LIMIT_MAX_RETRIES):
        response = requests.post(API_URL, headers=headers, json=clean_payload, timeout=timeout)
        if response.status_code == 429:
            wait = RATE_LIMIT_BASE_WAIT_SECONDS * (attempt + 1)
            print(f"  Rate limite : attente {wait}s avant nouvelle tentative ({attempt + 1}/{RATE_LIMIT_MAX_RETRIES - 1})...")
            time.sleep(wait)
            continue
        response.raise_for_status()
        return response.json()

    response.raise_for_status()
    return response.json()


# ---------------------------------------------------------------------------
# API publique
# ---------------------------------------------------------------------------

def call_mistral(
    lines: list[dict[str, Any]],
    api_key: str,
    company_info: dict[str, str] | None = None,
) -> dict[str, str]:
    """
    Envoie des lignes avec placeholders à Mistral et retourne les lignes remplies.

    Args:
        lines       : Liste de dicts {"id": str, "text": str} à remplir.
        api_key     : Clé API Mistral.
        company_info: Données entreprise à injecter (si None, importe depuis company_adapter).
    """
    if company_info is None:
        from app.services.filler.company_adapter import get_company_info
        company_info = get_company_info()

    company_block = json.dumps(company_info, ensure_ascii=False, indent=2)
    lines_block   = json.dumps(lines, ensure_ascii=False, indent=2)
    user_prompt   = f"Données entreprise :\n{company_block}\n\nLignes à remplir :\n{lines_block}"

    payload = {
        "model": TEXT_MODEL,
        "messages": [
            {"role": "system", "content": TEXT_SYSTEM_PROMPT},
            {"role": "user",   "content": user_prompt},
        ],
        "temperature": TEXT_LLM_TEMPERATURE,
        "response_format": {"type": "json_object"},
        "_timeout": TEXT_LLM_TIMEOUT,
    }

    result = _post_with_retry(payload, api_key)
    raw_content = result["choices"][0]["message"]["content"]

    try:
        return _normalize_filled_lines(json.loads(raw_content))
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw_content, re.DOTALL)
        return _normalize_filled_lines(json.loads(match.group(0))) if match else {}


def call_pixtral_vision(
    images: list[Any],
    api_key: str,
    doc_type: str = "unknown",
    company_info: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """
    Envoie les images de pages scannées à Pixtral pour lecture et remplissage.

    Args:
        images      : Liste d'images PIL, une par page.
        api_key     : Clé API Mistral.
        doc_type    : Type de document détecté (enrichit le prompt).
        company_info: Données entreprise (si None, importe depuis company_adapter).
    """
    if company_info is None:
        from app.services.filler.company_adapter import get_company_info
        company_info = get_company_info()

    content: list[dict[str, Any]] = []

    for i, img in enumerate(images):
        resized = _resize_for_api(img)
        buf = BytesIO()
        resized.save(buf, format="JPEG", quality=IMAGE_JPEG_QUALITY)
        b64 = base64.b64encode(buf.getvalue()).decode()
        kb  = len(buf.getvalue()) // 1024
        print(f"    Page {i + 1} : {resized.size[0]}x{resized.size[1]} px, {kb} Ko")
        content.append({"type": "text",      "text": f"Page {i + 1} :"})
        content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})

    company_block = json.dumps(company_info, ensure_ascii=False, indent=2)
    content.append({
        "type": "text",
        "text": f"Données entreprise pour remplir les placeholders :\n{company_block}",
    })

    system_prompt = get_vision_prompt(doc_type)

    payload = {
        "model": VISION_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": content},
        ],
        "temperature": VISION_LLM_TEMPERATURE,
        "max_tokens":  VISION_LLM_MAX_TOKENS,
        "response_format": {"type": "json_object"},
        "_timeout": VISION_LLM_TIMEOUT,
    }

    result = _post_with_retry(payload, api_key)
    raw    = result["choices"][0]["message"]["content"]

    finish_reason = result["choices"][0].get("finish_reason", "stop")
    if finish_reason == "length":
        print("  [WARN] Réponse Pixtral tronquée (limite de tokens atteinte). Récupération partielle...")

    paragraphs = _extract_paragraphs_safe(raw)
    if not paragraphs and finish_reason == "length":
        print("  [WARN] Aucun paragraphe complet récupéré depuis la réponse tronquée.")

    return paragraphs


def _extract_paragraphs_safe(raw: str) -> list[dict[str, Any]]:
    """Extrait les paragraphes depuis une réponse JSON potentiellement tronquée."""
    try:
        parsed = json.loads(raw)
        paragraphs = parsed.get("paragraphs", [])
        if isinstance(paragraphs, list):
            return [
                {"type": item.get("type", "body"), "text": item["text"].strip()}
                for item in paragraphs
                if isinstance(item, dict) and isinstance(item.get("text"), str) and item["text"].strip()
            ]
    except (json.JSONDecodeError, AttributeError):
        pass

    pattern = re.compile(
        r'\{\s*"type"\s*:\s*"([^"]+)"\s*,\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}'
        r'|\{\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"type"\s*:\s*"([^"]+)"\s*\}',
        re.DOTALL,
    )
    results = []
    for m in pattern.finditer(raw):
        if m.group(1):
            p_type, p_text = m.group(1), m.group(2)
        else:
            p_text, p_type = m.group(3), m.group(4)
        try:
            p_text = json.loads(f'"{p_text}"')
        except json.JSONDecodeError:
            pass
        if p_text.strip():
            results.append({"type": p_type, "text": p_text.strip()})

    if results:
        print(f"  [INFO] Récupération partielle : {len(results)} paragraphe(s) extraits par regex.")
        return results

    return []
