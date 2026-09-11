#!/usr/bin/env python3
"""
filler_table_extractor.py
--------------------------
Extraction de tableaux depuis un PDF vers un fichier Excel.

Deux couches de détection (même philosophie que filler_page_detector) :

    Couche 1  PyMuPDF find_tables() (gratuit, < 1s)
        Détection native des structures de tableaux dans les PDFs texte.
        PyMuPDF ≥ 1.23.0 analyse les lignes de bordure et les alignements
        pour reconstruire automatiquement headers + rows.
        Fiable pour les tableaux avec bordures visibles.

    Couche 2  Pixtral vision (fallback, API)
        Si la couche 1 échoue (PDF scanné ou tableau sans bordures nettes),
        les pages sont converties en images et envoyées à Pixtral avec
        le prompt TABLE_EXTRACTION_PROMPT. Pixtral retourne un JSON structuré.
        Fonctionne sur tous les types de PDF.

Sortie :
    Fichier .xlsx avec une feuille par tableau extrait, nommée selon le lot.
    Chaque feuille contient le titre du lot, les en-têtes de colonnes et les lignes.

Point d'entrée principal : extract_table_to_excel()
"""

import re
import sys
from io import BytesIO
from pathlib import Path
from typing import Any

try:
    import fitz
except ImportError:
    sys.exit("Installer PyMuPDF : pip install PyMuPDF")

try:
    import openpyxl
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
except ImportError:
    sys.exit("Installer openpyxl : pip install openpyxl")

from app.services.filler.filler_settings import (
    EXCEL_TABLE_SHEET_NAME,
    IMAGE_JPEG_QUALITY,
    IMAGE_MAX_SIDE_PX,
    LOT_REGISTRY,
    SCAN_DPI,
    TABLE_CELL_FONT_SIZE_MIN,
)


# ---------------------------------------------------------------------------
# Structures de données
# ---------------------------------------------------------------------------

# Représentation d'un tableau extrait
TableData = dict[str, Any]
# Clés : lot (int|None), title (str|None), headers (list[str]), rows (list[list[str]])


# ---------------------------------------------------------------------------
# Couche 1 : PyMuPDF find_tables()
# ---------------------------------------------------------------------------

def _detect_lot_from_context(page: Any, table_rect: Any) -> int | None:
    """
    Détecte le numéro de lot associé à un tableau en scannant le texte
    situé au-dessus du tableau sur la même page.

    Args:
        page      : Page PyMuPDF contenant le tableau.
        table_rect: Bounding box du tableau (fitz.Rect).

    Returns:
        Numéro de lot (entier) ou None si non détecté.
    """
    lot_pat = re.compile(LOT_REGISTRY["lot_pattern"])
    table_rect = fitz.Rect(table_rect)
    # Zone de recherche : les 120 points au-dessus du tableau
    search_rect = fitz.Rect(
        table_rect.x0,
        max(0, table_rect.y0 - 120),
        table_rect.x1,
        table_rect.y0,
    )
    context_text = page.get_text(clip=search_rect)
    match = lot_pat.search(context_text)
    if match:
        return int(match.group(1))
    return None


def _extract_tables_fitz(pdf_path: Path, pages: list[int]) -> list[TableData]:
    """
    Couche 1 : extrait les tableaux via PyMuPDF.find_tables().

    Nécessite PyMuPDF ≥ 1.23.0. Retourne une liste vide si la version
    est trop ancienne ou si aucun tableau n'est trouvé.

    Pour chaque tableau trouvé :
        - La première ligne non vide est considérée comme l'en-tête.
        - Les lignes suivantes forment le corps.
        - Les cellules fusionnées sont automatiquement gérées par PyMuPDF.

    Args:
        pdf_path: Chemin vers le PDF.
        pages   : Indices de pages à analyser (base 0).

    Returns:
        Liste de TableData extraites, une par tableau détecté.
    """
    # Vérifier la disponibilité de find_tables (PyMuPDF >= 1.23.0)
    if not hasattr(fitz.Page, "find_tables"):
        print("  [INFO] PyMuPDF < 1.23.0 : find_tables() non disponible, passage à Pixtral.")
        return []

    doc    = fitz.open(str(pdf_path))
    tables: list[TableData] = []

    for page_no in pages:
        page       = doc[page_no]
        page_tabs  = page.find_tables()

        if not page_tabs or not page_tabs.tables:
            continue

        for tab in page_tabs.tables:
            # Convertir en liste de listes de chaînes
            raw_data = tab.extract()
            if not raw_data:
                continue

            # Filtrer les lignes entièrement vides
            non_empty = [
                [str(cell).strip() if cell is not None else "" for cell in row]
                for row in raw_data
                if any(cell is not None and str(cell).strip() for cell in row)
            ]
            if not non_empty:
                continue

            # Première ligne non vide = en-têtes
            headers = non_empty[0]
            rows    = non_empty[1:]

            # Détecter le numéro de lot depuis le contexte au-dessus du tableau
            lot_number = _detect_lot_from_context(page, tab.bbox)

            # Récupérer le titre du lot si disponible
            lot_title = None
            if lot_number is not None:
                lot_pat   = re.compile(LOT_REGISTRY["lot_pattern"])
                tab_rect = fitz.Rect(tab.bbox)
                clip_rect = fitz.Rect(
                    tab_rect.x0,
                    max(0, tab_rect.y0 - 120),
                    tab_rect.x1,
                    tab_rect.y0,
                )
                context = page.get_text(clip=clip_rect).strip()
                for line in context.splitlines():
                    if lot_pat.search(line) and str(lot_number) in line:
                        lot_title = line.strip()
                        break

            tables.append({
                "lot":     lot_number,
                "title":   lot_title,
                "headers": headers,
                "rows":    rows,
                "source":  "fitz",
            })

    doc.close()
    return tables


# ---------------------------------------------------------------------------
# Couche 2 : Pixtral vision (fallback)
# ---------------------------------------------------------------------------

def _pages_to_images(pdf_path: Path, pages: list[int]) -> list[Any]:
    """
    Convertit les pages spécifiées en images PIL pour Pixtral.

    Args:
        pdf_path: Chemin vers le PDF.
        pages   : Indices de pages (base 0).

    Returns:
        Liste d'images PIL.
    """
    try:
        from pdf2image import convert_from_path
    except ImportError:
        sys.exit("Installer pdf2image : pip install pdf2image Pillow")

    first = pages[0] + 1
    last  = pages[-1] + 1
    return convert_from_path(str(pdf_path), dpi=SCAN_DPI, first_page=first, last_page=last)


def _call_pixtral_for_tables(images: list[Any], api_key: str) -> list[TableData]:
    """
    Couche 2 : envoie les images à Pixtral pour extraction de tableaux.

    Utilise TABLE_EXTRACTION_PROMPT qui demande à Pixtral de retourner
    le contenu des tableaux sous forme de JSON structuré sans aucune
    modification du contenu (extraction pure, pas de remplissage).

    Args:
        images : Images PIL des pages contenant les tableaux.
        api_key: Clé API Mistral.

    Returns:
        Liste de TableData extraites depuis la réponse JSON de Pixtral.
    """
    import base64
    import json
    import re as _re

    from app.services.filler.filler_llm import _post_with_retry
    from app.services.filler.prompts import TABLE_EXTRACTION_PROMPT
    from app.services.filler.filler_settings import VISION_LLM_MAX_TOKENS, VISION_LLM_TEMPERATURE, VISION_MODEL

    content: list[dict] = []
    for i, img in enumerate(images):
        # Redimensionner si nécessaire
        w, h = img.size
        if max(w, h) > IMAGE_MAX_SIDE_PX:
            scale = IMAGE_MAX_SIDE_PX / max(w, h)
            img   = img.resize((int(w * scale), int(h * scale)))

        buf = BytesIO()
        img.save(buf, format="JPEG", quality=IMAGE_JPEG_QUALITY)
        b64 = base64.b64encode(buf.getvalue()).decode()
        content.append({"type": "text",      "text": f"Page {i + 1} :"})
        content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})

    payload = {
        "model":      VISION_MODEL,
        "messages": [
            {"role": "system", "content": TABLE_EXTRACTION_PROMPT},
            {"role": "user",   "content": content},
        ],
        "temperature":   VISION_LLM_TEMPERATURE,
        "max_tokens":    VISION_LLM_MAX_TOKENS,
        "response_format": {"type": "json_object"},
        "_timeout": 300,
    }

    result = _post_with_retry(payload, api_key)
    raw    = result["choices"][0]["message"]["content"]

    # Parser la réponse JSON
    try:
        parsed = json.loads(raw)
        raw_tables = parsed.get("tables", [])
    except (json.JSONDecodeError, AttributeError):
        # Fallback regex
        match = _re.search(r"\{.*\}", raw, _re.DOTALL)
        if not match:
            return []
        try:
            parsed     = json.loads(match.group(0))
            raw_tables = parsed.get("tables", [])
        except (json.JSONDecodeError, AttributeError):
            return []

    # Normaliser chaque tableau
    tables: list[TableData] = []
    for t in raw_tables:
        if not isinstance(t, dict):
            continue
        headers = t.get("headers", [])
        rows    = t.get("rows", [])
        if not headers and not rows:
            continue
        lot = t.get("lot")
        tables.append({
            "lot":     int(lot) if lot is not None else None,
            "title":   t.get("title"),
            "headers": [str(h) for h in headers],
            "rows":    [[str(c) for c in row] for row in rows],
            "source":  "pixtral",
        })

    return tables


# ---------------------------------------------------------------------------
# Filtrage par lot
# ---------------------------------------------------------------------------

def _filter_by_lots(
    tables: list[TableData],
    lot_numbers: list[int] | None,
) -> list[TableData]:
    """
    Filtre les tableaux extraits pour ne garder que les lots demandés.

    Si lot_numbers est None, tous les tableaux sont conservés.
    Si un tableau n'a pas de numéro de lot détecté (lot=None),
    il est toujours inclus (ne pas jeter par défaut).

    Args:
        tables     : Tableaux extraits (avec champ "lot").
        lot_numbers: Liste de numéros de lots à garder, ou None pour tout garder.

    Returns:
        Sous-liste filtrée.
    """
    if lot_numbers is None:
        return tables
    return [
        t for t in tables
        if t.get("lot") is None or t.get("lot") in lot_numbers
    ]


# ---------------------------------------------------------------------------
# Écriture Excel
# ---------------------------------------------------------------------------

def _write_excel(tables: list[TableData], dst: Path) -> None:
    """
    Écrit les tableaux extraits dans un fichier Excel (.xlsx).

    Organisation :
        - Une feuille par tableau.
        - Nom de feuille : "Lot N" si lot détecté, sinon "Tableau 1", "Tableau 2"...
        - Ligne 1 : titre du lot (si disponible), en gras, fusionnée sur toutes les colonnes.
        - Ligne 2 (ou 1 si pas de titre) : en-têtes de colonnes, fond gris, gras.
        - Lignes suivantes : données.
        - Largeur de colonnes ajustée automatiquement.

    Args:
        tables: Liste de TableData à écrire.
        dst   : Chemin du fichier .xlsx de sortie.
    """
    wb = openpyxl.Workbook()
    # Supprimer la feuille par défaut
    if wb.active:
        wb.remove(wb.active)

    # Styles réutilisables
    header_fill  = PatternFill("solid", fgColor="C0C0C0")  # gris clair
    header_font  = Font(bold=True)
    title_font   = Font(bold=True, size=12)
    center_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
    left_align   = Alignment(horizontal="left",   vertical="top",    wrap_text=True)

    for i, table in enumerate(tables):
        lot = table.get("lot")
        if lot is not None:
            sheet_name = f"Lot {lot}"
        else:
            sheet_name = f"Tableau {i + 1}" if len(tables) > 1 else EXCEL_TABLE_SHEET_NAME

        # Limiter le nom de feuille à 31 caractères (limite Excel)
        ws = wb.create_sheet(title=sheet_name[:31])

        headers = table.get("headers", [])
        rows    = table.get("rows", [])
        n_cols  = max(len(headers), max((len(r) for r in rows), default=0), 1)

        current_row = 1

        # Ligne de titre (si disponible)
        title_text = table.get("title")
        if title_text:
            ws.cell(row=current_row, column=1, value=title_text)
            ws.cell(row=current_row, column=1).font      = title_font
            ws.cell(row=current_row, column=1).alignment = center_align
            if n_cols > 1:
                ws.merge_cells(
                    start_row=current_row, start_column=1,
                    end_row=current_row,   end_column=n_cols,
                )
            ws.row_dimensions[current_row].height = 30
            current_row += 1

        # Ligne d'en-têtes
        if headers:
            for col_idx, header in enumerate(headers, start=1):
                cell = ws.cell(row=current_row, column=col_idx, value=header)
                cell.font      = header_font
                cell.fill      = header_fill
                cell.alignment = center_align
            ws.row_dimensions[current_row].height = 35
            current_row += 1

        # Lignes de données
        for row_data in rows:
            for col_idx in range(1, n_cols + 1):
                val  = row_data[col_idx - 1] if col_idx - 1 < len(row_data) else ""
                cell = ws.cell(row=current_row, column=col_idx, value=val)
                cell.alignment = left_align
            ws.row_dimensions[current_row].height = 40
            current_row += 1

        # Ajuster la largeur des colonnes
        for col_idx in range(1, n_cols + 1):
            col_letter = get_column_letter(col_idx)
            max_len    = 10  # largeur minimale
            for row_data_row in ws.iter_rows(
                min_row=1, max_row=current_row - 1,
                min_col=col_idx, max_col=col_idx,
            ):
                for cell in row_data_row:
                    if cell.value:
                        text_len = max(len(str(line)) for line in str(cell.value).splitlines())
                        max_len  = max(max_len, min(text_len, 50))
            ws.column_dimensions[col_letter].width = max_len + 2

    wb.save(str(dst))


# ---------------------------------------------------------------------------
# Point d'entrée principal
# ---------------------------------------------------------------------------

def extract_table_to_excel(
    pdf_path: Path,
    pages: list[int],
    dst: Path,
    api_key: str | None = None,
    lot_numbers: list[int] | None = None,
) -> list[TableData]:
    """
    Extrait les tableaux des pages spécifiées et les enregistre en Excel.

    Orchestre les deux couches :
        Couche 1 → PyMuPDF find_tables() (gratuit, instantané)
        Couche 2 → Pixtral vision (fallback si couche 1 vide, nécessite API key)

    Args:
        pdf_path   : Chemin vers le PDF source.
        pages      : Pages à analyser (base 0).
        dst        : Chemin du fichier .xlsx de sortie.
        api_key    : Clé API Mistral (requis si couche 1 échoue).
        lot_numbers: Numéros de lots à inclure, None = tous.

    Returns:
        Liste des TableData effectivement écrits dans le fichier Excel.
        Liste vide si aucun tableau trouvé (fichier non créé dans ce cas).

    Raises:
        SystemExit: Si la couche 2 est nécessaire mais api_key est None.
    """
    print(f"  Extraction de tableau(x) sur {len(pages)} page(s)...")

    # --- Couche 1 : PyMuPDF ---
    tables = _extract_tables_fitz(pdf_path, pages)

    if tables:
        print(f"  Couche 1 (PyMuPDF) : {len(tables)} tableau(x) détecté(s).")
    else:
        print("  Couche 1 : aucun tableau détecté, passage à Pixtral (couche 2)...")
        if api_key is None:
            print("  [ERROR] Couche 2 requiert une clé API. Extraction annulée.")
            return []

        images = _pages_to_images(pdf_path, pages)
        tables = _call_pixtral_for_tables(images, api_key)
        print(f"  Couche 2 (Pixtral) : {len(tables)} tableau(x) retourné(s).")

    if not tables:
        print("  [WARN] Aucun tableau extrait. Fichier Excel non créé.")
        return []

    # --- Filtrage par lot ---
    tables = _filter_by_lots(tables, lot_numbers)
    if not tables:
        print(f"  [WARN] Aucun tableau pour les lots {lot_numbers}. Fichier Excel non créé.")
        return []

    # --- Écriture Excel ---
    dst.parent.mkdir(parents=True, exist_ok=True)
    _write_excel(tables, dst)

    for t in tables:
        lot_info = f"Lot {t['lot']}" if t.get("lot") else "lot inconnu"
        n_rows   = len(t.get("rows", []))
        n_cols   = len(t.get("headers", []))
        src_info = t.get("source", "?")
        print(f"    [{src_info:7s}] {lot_info} : {n_rows} ligne(s) × {n_cols} colonne(s)")

    print(f"  Fichier Excel → {dst}")
    return tables
