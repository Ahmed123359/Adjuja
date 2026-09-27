#!/usr/bin/env python3
"""
filler_llm.py
-------------
Acces aux modeles pour le remplissage, par ROLES (spec
context/feature-spec/fournisseurs-ia/, 2026-09-27) : le texte passe par le role
« analysis » (LLM_ANALYSIS), la vision par le role « vision » (VISION). Plus
aucun appel direct a l'API Mistral ni a Pixtral.

Remplissage d'un scan PAR PALIERS (`lire_et_remplir_scan`) :
    palier 2 : Tesseract avec mise en page (filler_ocr_layout) puis modele de
               texte -- rapide, peu couteux, aucune image transmise ;
    palier 3 : modele de vision, seulement si la lecture OCR n'est pas fiable
               (confiance ou volume de texte sous les seuils) ou si le modele
               de texte ne rend rien d'exploitable.
(Le palier 1, PDF avec couche texte, est le pipeline texte existant.)

API publique :
    - call_mistral()        : lignes a placeholders -> lignes remplies (nom conserve)
    - call_pixtral_vision() : document scanne generique, desormais par paliers
    - lire_et_remplir_scan(): paliers 2 puis 3, utilise aussi par l'orchestrateur
    - vision_json()         : appel vision brut (extraction de tableaux)
"""

import asyncio
import json
import re
import threading
import time
from io import BytesIO
from pathlib import Path
from typing import Any

from app.services.filler.prompts import TEXT_SYSTEM_PROMPT, get_vision_prompt
from app.services.filler.filler_settings import (
    IMAGE_JPEG_QUALITY,
    IMAGE_MAX_SIDE_PX,
    RATE_LIMIT_BASE_WAIT_SECONDS,
    RATE_LIMIT_MAX_RETRIES,
    SCAN_DPI,
    TEXT_LLM_TEMPERATURE,
    VISION_LLM_MAX_TOKENS,
    VISION_LLM_TEMPERATURE,
)

# Resolution de rendu pour Tesseract : a 150 dpi (celle des images envoyees au
# modele de vision), les caracteres fins des formulaires sont mal lus.
OCR_DPI = 300

_CONSIGNE_TEXTE_OCR = """

=== SOURCE : TEXTE OCR, PAS D'IMAGES ===
Le document t'est fourni sous forme de texte reconnu par OCR, mise en page
conservee (un bloc par paragraphe, retours a la ligne d'origine, pages
separees par « --- page N --- »). Des erreurs de reconnaissance sont possibles :
corrige-les d'apres le contexte. Applique exactement les memes etapes et le
meme format de sortie JSON que pour des images.
"""


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


def _executer(coro: Any) -> Any:
    """Execute une coroutine depuis du code synchrone, qu'une boucle tourne deja
    (pipeline appele depuis une tache async) ou non (tache Celery)."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    resultat: dict[str, Any] = {}

    def cible() -> None:
        try:
            resultat["ok"] = asyncio.run(coro)
        except BaseException as exc:  # remonte dans le thread appelant
            resultat["err"] = exc

    t = threading.Thread(target=cible)
    t.start()
    t.join()
    if "err" in resultat:
        raise resultat["err"]
    return resultat["ok"]


def _est_limite_debit(exc: BaseException) -> bool:
    code = getattr(exc, "status_code", None) or getattr(getattr(exc, "response", None), "status_code", None)
    return code == 429 or "RateLimit" in type(exc).__name__


def _avec_relances(appel: Any) -> str:
    """Relances sur limitation de debit, meme politique qu'avant, pour tout fournisseur."""
    for tentative in range(RATE_LIMIT_MAX_RETRIES):
        try:
            return appel()
        except Exception as exc:
            if not _est_limite_debit(exc) or tentative == RATE_LIMIT_MAX_RETRIES - 1:
                raise
            attente = RATE_LIMIT_BASE_WAIT_SECONDS * (tentative + 1)
            print(f"  Limite de debit : attente {attente}s ({tentative + 1}/{RATE_LIMIT_MAX_RETRIES - 1})...")
            time.sleep(attente)
    raise RuntimeError("inatteignable")


def texte_json(system: str, user: str, *, max_tokens: int = 8000, temperature: float = TEXT_LLM_TEMPERATURE) -> str:
    """Modele de texte du role « analysis », reponse JSON."""
    from app.providers.router import get_chat

    def appel() -> str:
        texte, _ = _executer(get_chat("analysis").generate_text(
            system, user, max_tokens, temperature, json_mode=True,
        ))
        return texte or ""
    return _avec_relances(appel)


def _jpeg(img: Any) -> bytes:
    buf = BytesIO()
    _resize_for_api(img).convert("RGB").save(buf, format="JPEG", quality=IMAGE_JPEG_QUALITY)
    return buf.getvalue()


def vision_json(system: str, images: list[Any], texte: str, *, max_tokens: int = VISION_LLM_MAX_TOKENS,
                temperature: float = VISION_LLM_TEMPERATURE) -> str:
    """Modele du role « vision », images PIL dans l'ordre des pages, reponse JSON."""
    from app.providers.router import get_vision

    jpegs = [_jpeg(img) for img in images]

    def appel() -> str:
        return _executer(get_vision().read(
            jpegs, texte, system=system, json_mode=True,
            max_tokens=max_tokens, temperature=temperature, mime="image/jpeg",
        )) or ""
    return _avec_relances(appel)


def _rendre_pages(pdf_path: Path, pages: list[int] | None, dpi: int) -> list[Any]:
    """Pages du PDF en images PIL (PyMuPDF, sans poppler)."""
    import fitz
    from PIL import Image

    images = []
    with fitz.open(str(pdf_path)) as pdf:
        indices = pages if pages is not None else range(len(pdf))
        for i in indices:
            pix = pdf[i].get_pixmap(dpi=dpi)
            images.append(Image.frombytes("RGB", (pix.width, pix.height), pix.samples))
    return images


def lire_et_remplir_scan(
    pdf_path: Path,
    pages: list[int] | None,
    system_prompt: str,
    company_info: dict[str, str],
) -> tuple[list[dict[str, Any]], str]:
    """Lit et remplit des pages scannees par paliers. Retourne (paragraphes,
    palier utilise : "ocr" ou "vision")."""
    from app.services.filler.filler_ocr_layout import lire_pages

    company_block = json.dumps(company_info, ensure_ascii=False, indent=2)

    # Palier 2 : Tesseract avec mise en page + modele de texte.
    try:
        lecture = lire_pages(_rendre_pages(pdf_path, pages, OCR_DPI))
        print(f"  OCR : {lecture.mots} mots, confiance moyenne {lecture.confiance:.0f}"
              f" -> {'palier OCR' if lecture.fiable else 'trop faible, palier vision'}")
        if lecture.fiable:
            raw = texte_json(
                system_prompt + _CONSIGNE_TEXTE_OCR,
                f"Texte OCR du document :\n{lecture.texte}\n\nDonnees entreprise :\n{company_block}",
                max_tokens=VISION_LLM_MAX_TOKENS,
            )
            paragraphes = _extract_paragraphs_safe(raw)
            if paragraphes:
                return paragraphes, "ocr"
            print("  Palier OCR : reponse inexploitable, palier vision.")
    except Exception as exc:
        print(f"  Palier OCR indisponible ({exc.__class__.__name__}), palier vision.")

    # Palier 3 : modele de vision.
    raw = vision_json(
        system_prompt,
        _rendre_pages(pdf_path, pages, SCAN_DPI),
        f"Donnees entreprise pour remplir les placeholders :\n{company_block}",
    )
    return _extract_paragraphs_safe(raw), "vision"


# ---------------------------------------------------------------------------
# API publique
# ---------------------------------------------------------------------------

def call_mistral(
    lines: list[dict[str, Any]],
    api_key: str,
    company_info: dict[str, str] | None = None,
) -> dict[str, str]:
    """
    Envoie des lignes avec placeholders au modele du role « analysis » et
    retourne les lignes remplies (nom historique conserve pour les appelants).

    Args:
        lines       : Liste de dicts {"id": str, "text": str} à remplir.
        api_key     : Ignoree : la cle vient du fournisseur du role (conservee pour les appelants).
        company_info: Données entreprise à injecter (si None, importe depuis company_adapter).
    """
    if company_info is None:
        from app.services.filler.company_adapter import get_company_info
        company_info = get_company_info()

    company_block = json.dumps(company_info, ensure_ascii=False, indent=2)
    lines_block   = json.dumps(lines, ensure_ascii=False, indent=2)
    user_prompt   = f"Données entreprise :\n{company_block}\n\nLignes à remplir :\n{lines_block}"

    raw_content = texte_json(TEXT_SYSTEM_PROMPT, user_prompt, temperature=TEXT_LLM_TEMPERATURE)

    try:
        return _normalize_filled_lines(json.loads(raw_content))
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw_content, re.DOTALL)
        return _normalize_filled_lines(json.loads(match.group(0))) if match else {}


def call_pixtral_vision(
    pdf_path: Path,
    pages: list[int] | None = None,
    doc_type: str = "unknown",
    company_info: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """
    Document scanne generique : lecture et remplissage PAR PALIERS (OCR puis,
    si besoin, vision). Nom historique conserve ; ne depend plus de Pixtral.

    Args:
        pdf_path    : PDF scanne.
        pages       : Pages a traiter (index 0), None = toutes.
        doc_type    : Type de document detecte (enrichit le prompt).
        company_info: Donnees entreprise (si None, importe depuis company_adapter).
    """
    if company_info is None:
        from app.services.filler.company_adapter import get_company_info
        company_info = get_company_info()
    paragraphes, palier = lire_et_remplir_scan(pdf_path, pages, get_vision_prompt(doc_type), company_info)
    print(f"  {len(paragraphes)} paragraphe(s), palier {palier}.")
    return paragraphes


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
