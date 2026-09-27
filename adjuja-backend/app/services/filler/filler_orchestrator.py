#!/usr/bin/env python3
"""
filler_orchestrator.py
-----------------------
Dispatcher principal : coordonne segmentation, extraction de cas,
remplissage LLM et extraction de tableaux pour un PDF entier.

Architecture Action Registry :
    Chaque type de document dans DOCUMENT_REGISTRY a un champ "action" :
        "fill"          → pipeline remplissage (texte, ou scan par paliers : OCR puis vision)
        "extract_table" → pipeline extraction tableau → Excel
        "skip"          → ignoré silencieusement

    L'orchestrateur lit ces champs et dispatche vers le bon handler.
    Ajouter un nouveau type de document = une entrée dans settings.py uniquement.

Point d'entrée principal : run()
Intégration web : appeler run(pdf_path, profile, api_key, output_dir)
"""

import re
import traceback
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.services.filler.company_adapter import get_company_info
from app.services.filler.filler_llm import call_mistral, call_pixtral_vision
from app.services.filler.filler_processors import (
    _build_docx_from_paragraphs,
    _build_pdf_from_paragraphs,
    convert_docx_to_pdf,
    is_scanned_pdf,
    process_scanned_pdf,
    process_text_pdf,
)
from app.services.filler.filler_segmenter import segment_document, summarize_segmentation
from app.services.filler.filler_table_extractor import extract_table_to_excel
from app.services.filler.prompts import get_vision_prompt_case
from app.services.filler.filler_settings import (
    CASE_REGISTRY,
    DOCUMENT_REGISTRY,
    OUTPUT_DIR_SUFFIX,
)


# ---------------------------------------------------------------------------
# Résultat d'une opération de traitement
# ---------------------------------------------------------------------------

@dataclass
class ProcessingResult:
    """
    Résultat d'une opération de traitement pour un type de document.

    Attributs :
        doc_type   : Type de document traité (ex. "acte_engagement").
        action     : Action exécutée ("fill", "extract_table", "skip").
        output_path: Chemin du fichier produit, ou None si action="skip".
        success    : True si le traitement s'est terminé sans erreur.
        message    : Message informatif ou description d'erreur.
        extra      : Données supplémentaires spécifiques à l'action.
    """
    doc_type:    str
    action:      str
    output_path: Path | None = None
    success:     bool        = True
    message:     str         = ""
    extra:       dict        = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Helpers internes
# ---------------------------------------------------------------------------

def _resolve_output_dir(pdf_path: Path, profile: dict) -> Path:
    """
    Détermine le répertoire de sortie.

    Si profile["output_dir"] est défini, l'utilise directement.
    Sinon, génère automatiquement <nom_fichier>_output/ dans le même dossier.

    Args:
        pdf_path: Chemin du fichier PDF source.
        profile : Profil de traitement (peut contenir "output_dir").

    Returns:
        Chemin absolu du répertoire de sortie (non encore créé).
    """
    custom = profile.get("output_dir")
    if custom:
        return Path(custom).resolve()
    return pdf_path.parent / f"{pdf_path.stem}{OUTPUT_DIR_SUFFIX}"


def _output_filename(
    doc_type: str,
    output_format: str,
    case_name: str | None,
    lot_number: int | None,
) -> str:
    """
    Génère un nom de fichier de sortie lisible et non ambigu.

    Format : <doc_type>[_<case>][_lot<N>]_filled.<ext>
    Exemple : acte_engagement_societe_lot2_filled.pdf

    Args:
        doc_type     : Type de document.
        output_format: Extension cible ("pdf", "docx", "excel").
        case_name    : Nom du cas juridique, ou None.
        lot_number   : Numéro de lot, ou None.

    Returns:
        Nom de fichier avec extension.
    """
    ext_map  = {"pdf": "pdf", "docx": "docx", "excel": "xlsx"}
    ext      = ext_map.get(output_format, output_format)
    parts    = [doc_type]
    if case_name:
        parts.append(case_name)
    if lot_number is not None:
        parts.append(f"lot{lot_number}")
    if ext != "xlsx":
        parts.append("filled")
    return "_".join(parts) + f".{ext}"


# ---------------------------------------------------------------------------
# Helpers internes  détection encodage corrompu
# ---------------------------------------------------------------------------

def _pages_have_corrupted_spans(pdf_path: Path, pages: list[int]) -> bool:
    """
    Détecte si les pages cibles ont un encodage font corrompu via get_text("dict").

    get_text("dict") retourne les spans bruts du PDF  sur certains PDFs OCR,
    chaque lettre est un span séparé entouré de tirets (-l- -e- -t-t-r-e-s-).
    get_text() simple les normalise mais le case_extractor utilise "dict".
    Si ratio > 5% des chars sont dans ce pattern, forcer le chemin des scans (paliers OCR puis vision).
    """
    try:
        doc       = fitz.open(str(pdf_path))
        page_text = ""
        for p in pages:
            if p < len(doc):
                for blk in doc[p].get_text("dict")["blocks"]:
                    if blk.get("type") == 0:
                        for line in blk.get("lines", []):
                            for span in line.get("spans", []):
                                page_text += span.get("text", "")
        doc.close()
        if not page_text:
            return False
        matches = re.findall(r"-[A-Za-zÀ-ÿ0-9]-", page_text)
        ratio   = len(matches) * 3 / max(len(page_text), 1)
        return ratio > 0.05
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Handler : remplissage (action = "fill")
# ---------------------------------------------------------------------------

def _handle_fill(
    pdf_path: Path,
    pages: list[int],
    doc_type: str,
    is_scanned: bool,
    profile: dict,
    out_dir: Path,
    api_key: str,
) -> ProcessingResult:
    """
    Pipeline de remplissage pour un document texte ou scanné.

    Pour les PDFs texte :
        - Si case_aware : extraction du cas sélectionné + remplissage Mistral
          + reconstruction propre DOCX/PDF
        - Sinon : pipeline process_text_pdf() existant (modifie l'original)

    Pour les PDFs scannés :
        - Scan par paliers (OCR puis vision) avec prompt enrichi du cas et du lot
        - Reconstruction DOCX + PDF

    Args:
        pdf_path  : Chemin du PDF source.
        pages     : Pages appartenant à ce doc_type.
        doc_type  : Type de document.
        is_scanned: True si PDF scanné.
        profile   : Profil de traitement (company_case, lots).
        out_dir   : Répertoire de sortie.
        api_key   : Clé API Mistral.

    Returns:
        ProcessingResult avec le chemin du fichier produit.
    """
    registry      = DOCUMENT_REGISTRY.get(doc_type, {})
    case_aware    = registry.get("case_aware", False)
    lot_aware     = registry.get("lot_aware", False)
    output_format = registry.get("output_format", "docx")

    # Résolution du cas et du lot depuis le profil
    case_name  = profile.get("company_case") if case_aware else None
    lots       = profile.get("lots")
    lot_number = lots[0] if lots and lot_aware else None

    # Validation du cas
    if case_aware and case_name:
        available_cases = list(CASE_REGISTRY.get(doc_type, {}).keys())
        if case_name not in available_cases:
            return ProcessingResult(
                doc_type=doc_type,
                action="fill",
                success=False,
                message=(
                    f"Cas '{case_name}' inconnu pour '{doc_type}'. "
                    f"Cas disponibles : {available_cases}"
                ),
            )

    # Nom et chemin du fichier de sortie
    filename = _output_filename(doc_type, output_format, case_name, lot_number)
    dst      = out_dir / filename

    try:
        # Re-check scanned status at page level: get_text("dict") spans may have
        # corrupted encoding on specific pages even if the full document seems readable.
        if not is_scanned and case_aware and case_name:
            is_scanned = _pages_have_corrupted_spans(pdf_path, pages)
            if is_scanned:
                print(f"  [WARN] Encodage corrompu détecté sur pages {[p+1 for p in pages]} → chemin scan")

        if not is_scanned:
            # ----------------------------------------------------------------
            # Pipeline texte
            # ----------------------------------------------------------------
            if case_aware and case_name:
                _fill_text_pdf_with_case(
                    pdf_path, pages, doc_type, case_name, lot_number, dst, api_key
                )
            else:
                # Pipeline existant : modifie le PDF original chirurgicalement
                process_text_pdf(pdf_path, dst, api_key, pages=pages)

        else:
            # ----------------------------------------------------------------
            # Pipeline scanné (paliers OCR puis vision)
            # ----------------------------------------------------------------
            if case_aware and case_name:
                _fill_scanned_with_case(
                    pdf_path, pages, doc_type, case_name, lot_number, dst, api_key
                )
            else:
                process_scanned_pdf(
                    pdf_path, dst, api_key,
                    doc_type=doc_type,
                    pages=pages,
                )

        return ProcessingResult(
            doc_type=doc_type,
            action="fill",
            output_path=dst,
            success=True,
            message=f"Rempli → {dst.name}",
        )

    except Exception as exc:  # noqa: BLE001
        return ProcessingResult(
            doc_type=doc_type,
            action="fill",
            success=False,
            message=f"Erreur lors du remplissage : {exc}\n{traceback.format_exc()}",
        )


def _fill_text_pdf_with_case(
    pdf_path: Path,
    pages: list[int],
    doc_type: str,
    case_name: str,
    lot_number: int | None,
    dst: Path,
    api_key: str,
) -> None:
    """
    Remplit un PDF texte en extrayant uniquement le cas sélectionné.

    Flux en 2 phases :
        Phase 1  Extraction et rédaction :
            Identifie les limites du cas sélectionné dans les pages cibles,
            copie ces pages dans un nouveau PDF, et rédige (rectangle blanc)
            toutes les sections qui ne font pas partie du cas choisi.
            Les pages entièrement vides après rédaction sont supprimées.

        Phase 2  Remplissage :
            Délègue le remplissage des placeholders à process_text_pdf(),
            le pipeline éprouvé qui extrait chaque ligne visuelle séparément
            et applique le remplissage chirurgical ligne par ligne.
            Cela garantit une qualité de remplissage identique à l'architecture
            précédente.

    Args:
        pdf_path  : Chemin du PDF source.
        pages     : Pages du document (0-indexées).
        doc_type  : Type de document.
        case_name : Cas à extraire et remplir.
        lot_number: Numéro de lot (contexte), ou None.
        dst       : Chemin du fichier de sortie.
        api_key   : Clé API Mistral.
    """
    from app.services.filler.filler_case_extractor import (
        apply_fills_to_case,
        extract_for_fill,
    )
    print(f"  Extraction du cas : {case_name}")
    header_paragraphs, line_items, case_blocks, block_index_map = extract_for_fill(
        pdf_path,
        pages,
        doc_type,
        case_name,
        lot_number=lot_number,
    )

    print(f"  En-tête : {len(header_paragraphs)} bloc(s) | Cas : {len(case_blocks)} bloc(s)")
    print(f"  {len(line_items)} ligne(s) avec placeholders trouvée(s).")
    for item in line_items:
        print(f"    [{item['id']}] {item['text'][:80]}")

    if not line_items:
        paragraphs = header_paragraphs + apply_fills_to_case(case_blocks, {}, block_index_map)
    else:
        print("  Envoi à Mistral pour remplissage...")
        filled_lines = call_mistral(line_items, api_key)
        print(f"  LLM a rempli {len(filled_lines)} ligne(s).")
        paragraphs = header_paragraphs + apply_fills_to_case(case_blocks, filled_lines, block_index_map)

    paragraphs = _normalize_scanned_case_paragraphs(paragraphs, doc_type, case_name, lot_number)

    _write_case_outputs(paragraphs, dst)


def _fill_scanned_with_case(
    pdf_path: Path,
    pages: list[int],
    doc_type: str,
    case_name: str,
    lot_number: int | None,
    dst: Path,
    api_key: str,
) -> None:
    """
    Remplit un PDF scanné en n'extrayant et remplissant que le cas
    sélectionné, par paliers (OCR puis vision si besoin).

    Le prompt enrichi (get_vision_prompt_case) indique au modele :
        - Quel cas extraire
        - Quel lot est concerné
        - Ignorer toutes les autres variantes

    Args:
        pdf_path  : Chemin du PDF scanné.
        pages     : Pages du document.
        doc_type  : Type de document.
        case_name : Cas à extraire.
        lot_number: Numéro de lot, ou None.
        dst       : Chemin du fichier de sortie.
        api_key   : Clé API Mistral.
    """
    case_cfg   = CASE_REGISTRY.get(doc_type, {}).get(case_name, {})
    case_label = case_cfg.get("label", case_name)

    print(f"  Lecture par paliers  cas : {case_label} | lot : {lot_number or 'tous'}...")
    system_prompt = get_vision_prompt_case(doc_type, case_name, case_label, lot_number)

    from app.services.filler.company_adapter import get_company_info
    from app.services.filler.filler_llm import lire_et_remplir_scan

    # Palier 2 (Tesseract avec mise en page + modele de texte), palier 3
    # (modele de vision) seulement si la lecture OCR n'est pas fiable.
    paragraphs, palier = lire_et_remplir_scan(pdf_path, pages, system_prompt, get_company_info())
    paragraphs = _normalize_scanned_case_paragraphs(paragraphs, doc_type, case_name, lot_number)

    if not paragraphs:
        raise RuntimeError("Aucun paragraphe lu pour ce cas dans le document scanne.")

    print(f"  {len(paragraphs)} paragraphe(s) extrait(s), palier {palier}.")

    _write_case_outputs(paragraphs, dst)


def _write_case_outputs(paragraphs: list[dict[str, Any]], dst: Path) -> None:
    """
    Produit systématiquement un DOCX et un PDF séparés pour un document reconstruit.

    - Écrit toujours le DOCX en premier (qualité maximale).
    - Tente ensuite la conversion LibreOffice, puis le fallback PyMuPDF.
    - Une erreur PDF n'interrompt pas la sauvegarde du DOCX.
    """
    dst_docx = dst.with_suffix(".docx")
    dst_pdf  = dst.with_suffix(".pdf")

    print(f"  Reconstruction DOCX -> {dst_docx.name}")
    _build_docx_from_paragraphs(paragraphs, dst_docx)

    try:
        if convert_docx_to_pdf(dst_docx, dst_pdf):
            print(f"  Conversion DOCX->PDF -> {dst_pdf.name}")
        else:
            print(f"  Reconstruction PDF  -> {dst_pdf.name} (fallback)")
            _build_pdf_from_paragraphs(paragraphs, dst_pdf)
    except Exception as exc:
        print(f"  [WARN] Génération PDF échouée ({exc})  DOCX disponible : {dst_docx.name}")


def _normalize_scanned_case_paragraphs(
    paragraphs: list[dict[str, Any]],
    doc_type: str,
    case_name: str,
    lot_number: int | None,
) -> list[dict[str, Any]]:
    """
    Nettoyage post-Pixtral pour les cas scannés :
      - supprimer les lots non demandés
      - rattacher les valeurs orphelines à leur étiquette
      - remplir quelques champs financiers mock dans la partie commune
    """
    cleaned: list[dict[str, Any]] = []
    skip_next_lot_continuation = False

    for item in paragraphs:
        kind = item.get("type", "body")
        text = " ".join(item.get("text", "").split()).strip()
        if not text:
            continue

        if lot_number is not None:
            lot_match = re.search(r"Lot\s*[nN]°?\s*(\d+)", text, re.IGNORECASE)
            if lot_match and int(lot_match.group(1)) != lot_number:
                skip_next_lot_continuation = True
                continue
            if skip_next_lot_continuation:
                if re.search(r"Lot\s*[nN]°?\s*\d+", text, re.IGNORECASE) or re.match(r"^[A-D]\s*[-:]", text):
                    skip_next_lot_continuation = False
                else:
                    continue

        cleaned.append({"type": kind, "text": text})

    cleaned = _remove_skipped_case_sections(cleaned, doc_type, case_name)
    cleaned = _merge_orphan_value_paragraphs(cleaned)
    cleaned = _fill_mock_financial_values(cleaned, doc_type, case_name, lot_number)
    return cleaned


def _remove_skipped_case_sections(
    paragraphs: list[dict[str, Any]],
    doc_type: str,
    case_name: str,
) -> list[dict[str, Any]]:
    case_cfg = CASE_REGISTRY.get(doc_type, {}).get(case_name, {})
    skip_rules = case_cfg.get("skip_within_keywords", [])
    if not skip_rules:
        return paragraphs

    result: list[dict[str, Any]] = []
    active_rule: dict[str, Any] | None = None

    for item in paragraphs:
        lowered = item["text"].lower()

        if active_rule is not None:
            end_keywords = active_rule.get("end", [])
            if any(keyword.lower() in lowered for keyword in end_keywords):
                active_rule = None
            else:
                continue

        matched_rule = next(
            (
                rule for rule in skip_rules
                if any(keyword.lower() in lowered for keyword in rule.get("start", []))
            ),
            None,
        )
        if matched_rule is not None:
            active_rule = matched_rule
            continue

        result.append(item)

    return result


def _paragraph_needs_value(text: str) -> bool:
    patterns = [
        r"^Je soussign[ée]?$",
        r"^agissant au nom et pour le compte de$",
        r"^Adresse du siège social de la société\s*:\s*$",
        r"^Adresse du domicile élu\s*:\s*$",
        r"^Affiliée?\s+à.*$",
        r"^sous le numéro\s*:\s*$",
        r"^Inscrite?\s+au registre du commerce.*$",
        r"^Inscrite?\s+à la taxe professionnelle sous le numéro\s*:\s*$",
        r"^Numéro de l.?identifiant commun de l.?entreprise\s*:\s*$",
        r"^Fait à\s*$",
    ]
    return any(re.match(pattern, text, re.IGNORECASE) for pattern in patterns)


def _looks_like_orphan_value(text: str) -> bool:
    if not text or ":" in text:
        return False
    if text.startswith(("-", "–", "•")):
        return False
    if re.match(r"^[A-D]\s*[-:]", text):
        return False
    return len(text) <= 100


def _merge_orphan_value_paragraphs(paragraphs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    pending_labels: list[int] = []

    for item in paragraphs:
        text = item["text"].strip()
        if _paragraph_needs_value(text):
            merged.append({"type": item["type"], "text": text})
            pending_labels.append(len(merged) - 1)
            continue

        if pending_labels and _looks_like_orphan_value(text):
            target = merged[pending_labels.pop(0)]
            joiner = "" if target["text"].endswith(("de", "à", "au", "du")) else " "
            target["text"] = f"{target['text'].rstrip()}{joiner}{text}".strip()
            continue

        merged.append({"type": item["type"], "text": text})

    return merged


def _replace_placeholder_with_value(text: str, value: str) -> str:
    return re.sub(r"[.…_]{3,}", value, text, count=1)


def _fill_mock_financial_values(
    paragraphs: list[dict[str, Any]],
    doc_type: str,
    case_name: str,
    lot_number: int | None,
) -> list[dict[str, Any]]:
    if doc_type != "acte_engagement":
        return paragraphs

    from app.services.filler.company_adapter import get_company_info as _get_ci
    _ci = _get_ci()
    replacements = {
        "montant hors tva":                       _ci.get("amount_ht", ""),
        "taux de la tva":                         _ci.get("tva_rate", ""),
        "montant de la tva":                      _ci.get("amount_tva", ""),
        "montant tva comprise":                   _ci.get("amount_ttc", ""),
        "montant estimé toutes taxes comprises":  _ci.get("estimated_ttc", ""),
        "taux du rabais ou majoration":           _ci.get("discount_rate", ""),
    }

    filled: list[dict[str, Any]] = []
    for item in paragraphs:
        text = item["text"]
        lowered = text.lower()

        if lot_number is not None and re.search(r"Lot\s*[nN]°?\s*[.…_]{3,}", text):
            text = re.sub(r"Lot\s*[nN]°?\s*[.…_]{3,}", f"Lot n°{lot_number}", text)

        for label, value in replacements.items():
            if label in lowered and re.search(r"[.…_]{3,}", text):
                text = _replace_placeholder_with_value(text, value)
                break

        text = re.sub(r"\s{2,}", " ", text).strip()

        filled.append({"type": item["type"], "text": text})

    return filled


# ---------------------------------------------------------------------------
# Handler : extraction de tableau (action = "extract_table")
# ---------------------------------------------------------------------------

def _handle_extract_table(
    pdf_path: Path,
    pages: list[int],
    doc_type: str,
    profile: dict,
    out_dir: Path,
    api_key: str,
) -> ProcessingResult:
    """
    Pipeline d'extraction de tableau vers Excel.

    Orchestre extract_table_to_excel() avec les paramètres issus du profil.

    Args:
        pdf_path: Chemin du PDF source.
        pages   : Pages du document contenant les tableaux.
        doc_type: Type de document (ex. "bordereau_prix").
        profile : Profil (lots à extraire).
        out_dir : Répertoire de sortie.
        api_key : Clé API Mistral (pour le fallback Pixtral).

    Returns:
        ProcessingResult avec le chemin du fichier Excel produit.
    """
    lot_numbers = profile.get("lots")
    filename    = _output_filename(doc_type, "excel", None, None)
    dst         = out_dir / filename

    try:
        tables = extract_table_to_excel(
            pdf_path,
            pages,
            dst,
            api_key=api_key,
            lot_numbers=lot_numbers,
        )

        if not tables:
            return ProcessingResult(
                doc_type=doc_type,
                action="extract_table",
                success=False,
                message="Aucun tableau extrait. Vérifier que le PDF contient des tableaux.",
            )

        return ProcessingResult(
            doc_type=doc_type,
            action="extract_table",
            output_path=dst,
            success=True,
            message=f"Extrait → {dst.name} ({len(tables)} tableau(x))",
            extra={"tables_count": len(tables)},
        )

    except Exception as exc:  # noqa: BLE001
        return ProcessingResult(
            doc_type=doc_type,
            action="extract_table",
            success=False,
            message=f"Erreur lors de l'extraction : {exc}\n{traceback.format_exc()}",
        )


# ---------------------------------------------------------------------------
# Point d'entrée principal
# ---------------------------------------------------------------------------

def run(
    pdf_path: Path,
    profile: dict,
    api_key: str,
    output_dir: Path | None = None,
) -> list[ProcessingResult]:
    """
    Orchestre le traitement complet d'un PDF : segmentation → dispatch → sortie.

    Flux complet :
        1. Détection si PDF scanné ou texte.
        2. Segmentation : {doc_type: [page_indices]} via filler_segmenter.
        3. Pour chaque type détecté, dispatch selon DOCUMENT_REGISTRY["action"] :
               "fill"          → _handle_fill()
               "extract_table" → _handle_extract_table()
               "skip"          → ignoré
        4. Collecte et retour des résultats.

    Intégration web :
        results = run(pdf_path, profile, api_key)
        for r in results:
            if r.success:
                send_file_to_user(r.output_path)
            else:
                log_error(r.message)

    Args:
        pdf_path  : Chemin absolu vers le PDF à traiter.
        profile   : Profil de traitement (voir processing_profile.py).
        api_key   : Clé API Mistral.
        output_dir: Répertoire de sortie. None = auto-généré.

    Returns:
        Liste de ProcessingResult, un par type de document traité (actions != skip).
    """
    pdf_path = Path(pdf_path).resolve()

    # --- Préparation du répertoire de sortie ---
    out_dir = (Path(output_dir).resolve() if output_dir else _resolve_output_dir(pdf_path, profile))
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"\n{'=' * 60}")
    print(f"  Fichier   : {pdf_path.name}")
    print(f"  Sortie    : {out_dir}")
    print(f"  Cas       : {profile.get('company_case', 'non spécifié')}")
    print(f"  Lots      : {profile.get('lots') or 'tous'}")
    print(f"{'=' * 60}\n")

    # --- Détection PDF scanné / texte ---
    scanned = is_scanned_pdf(pdf_path)
    print(f"  Format PDF : {'scanné (images)' if scanned else 'texte extractible'}")

    # --- Segmentation ---
    print("\n  [ÉTAPE 1] Segmentation du document...")
    from fitz import open as fitz_open
    total_pages = fitz_open(str(pdf_path)).page_count
    segments    = segment_document(pdf_path, is_scanned=scanned)
    summarize_segmentation(segments, total_pages)

    if not segments:
        print("\n  [WARN] Aucun type de document actif détecté. Vérifier le contenu du PDF.")
        return []

    # --- Dispatch ---
    print("\n  [ÉTAPE 2] Traitement par type de document...\n")
    results: list[ProcessingResult] = []

    for doc_type, pages in segments.items():
        registry = DOCUMENT_REGISTRY.get(doc_type, {})
        action   = registry.get("action", "skip")

        print(f"  ── {doc_type} (pages {[p + 1 for p in pages]}, action={action}) ──")

        if action == "fill":
            result = _handle_fill(
                pdf_path, pages, doc_type, scanned, profile, out_dir, api_key
            )
        elif action == "extract_table":
            result = _handle_extract_table(
                pdf_path, pages, doc_type, profile, out_dir, api_key
            )
        else:
            # Ne devrait pas arriver (segmenter filtre déjà les "skip")
            continue

        results.append(result)

        status = "✓" if result.success else "✗"
        print(f"  {status} {result.message}\n")

    return results


# ---------------------------------------------------------------------------
# Résumé terminal
# ---------------------------------------------------------------------------

def print_summary(results: list[ProcessingResult]) -> None:
    """
    Affiche un résumé lisible de tous les résultats de traitement.

    Args:
        results: Liste retournée par run().
    """
    print(f"\n{'=' * 60}")
    print(f"  RÉSUMÉ : {len(results)} document(s) traité(s)")
    print(f"{'=' * 60}")

    successes = [r for r in results if r.success]
    failures  = [r for r in results if not r.success]

    for r in successes:
        print(f"  ✓ [{r.action:13s}] {r.doc_type:25s} → {r.output_path.name if r.output_path else ''}")

    for r in failures:
        print(f"  ✗ [{r.action:13s}] {r.doc_type:25s} → ERREUR : {r.message.splitlines()[0]}")

    print(f"\n  {len(successes)} succès, {len(failures)} échec(s)")
    print(f"{'=' * 60}\n")
