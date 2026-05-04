import json
import logging
import re
import subprocess
from pathlib import Path

from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

from app.models.offre_technique import CPSContext

logger = logging.getLogger(__name__)

SECTION_TITLES = {
    "methodologie": "1. Méthodologie et Organisation",
    "moyens":       "2. Moyens Humains et Matériels",
    "planning":     "3. Planning d'Exécution",
    "rse":          "4. Démarche RSE et Développement Durable",
    "references":   "5. Références Similaires et Fiches Techniques",
}

_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")


def _strip_md(text: str) -> str:
    """Remove markdown bold/italic markers for headings."""
    return _BOLD_RE.sub(r"\1", text).replace("*", "").strip()


def _add_rich_paragraph(doc: Document, text: str, style: str | None = None) -> None:
    """Add a paragraph with inline **bold** rendered as Word bold runs."""
    p = doc.add_paragraph(style=style) if style else doc.add_paragraph()
    # strip leading emoji bullets like ✅
    text = re.sub(r"^[✅✔☑►•·]\s*", "", text.strip())
    parts = _BOLD_RE.split(text)
    for i, part in enumerate(parts):
        if not part:
            continue
        run = p.add_run(part)
        run.bold = bool(i % 2)  # odd parts are inside **...**


def _add_markdown_table(doc: Document, lines: list[str]) -> None:
    """Convert markdown table lines into a native Word table."""
    rows = []
    for line in lines:
        stripped = line.strip().strip("|")
        if re.match(r"^[\s\-|:]+$", stripped):
            continue  # separator row
        cells = [c.strip() for c in stripped.split("|")]
        if any(cells):
            rows.append(cells)

    if not rows:
        return

    cols = max(len(r) for r in rows)
    table = doc.add_table(rows=len(rows), cols=cols)
    table.style = "Table Grid"

    for i, row in enumerate(rows):
        for j in range(cols):
            cell_text = row[j] if j < len(row) else ""
            clean = _strip_md(cell_text)
            cell = table.rows[i].cells[j]
            cell.text = clean
            if i == 0 and cell.paragraphs[0].runs:
                cell.paragraphs[0].runs[0].font.bold = True

    doc.add_paragraph()


def _add_planning_table(doc: Document, planning_text: str) -> None:
    """Extract planning JSON (even inside ```json blocks) and render as Gantt table."""
    try:
        # Strip code block wrapper if present
        clean = re.sub(r"```(?:json)?\s*", "", planning_text, flags=re.IGNORECASE).strip()
        m = re.search(r"\{.*\}", clean, re.DOTALL)
        if not m:
            _render_section(doc, planning_text)
            return

        data = json.loads(m.group(0))

        # Handle nested root key (e.g. {"planning_execution": {"phases": [...]}})
        if "phases" not in data:
            for v in data.values():
                if isinstance(v, dict) and "phases" in v:
                    data = v
                    break

        phases    = data.get("phases", [])
        narrative = data.get("description", "")

        if phases:
            table = doc.add_table(rows=1, cols=4)
            table.style = "Table Grid"
            hdr = table.rows[0].cells
            for i, h in enumerate(["Phase", "Durée", "Jalons", "Livrables"]):
                hdr[i].text = h
                if hdr[i].paragraphs[0].runs:
                    hdr[i].paragraphs[0].runs[0].font.bold = True

            for phase in phases:
                row = table.add_row().cells
                row[0].text = phase.get("nom", "")
                row[1].text = phase.get("duree", "")
                row[2].text = "\n".join(phase.get("jalons", []))
                row[3].text = "\n".join(phase.get("livrables", []))

            doc.add_paragraph()

        if narrative:
            doc.add_paragraph(narrative)

    except (json.JSONDecodeError, KeyError, StopIteration):
        _render_section(doc, planning_text)


def _render_section(doc: Document, text: str) -> None:
    """
    Parse markdown-like LLM output and render into Word.
    Handles: # headings, **bold**, bullet lists, --- rules, markdown tables, code blocks.
    """
    lines        = text.split("\n")
    in_code      = False
    table_buf: list[str] = []
    section_heading_skipped = False

    def flush_table() -> None:
        if table_buf:
            _add_markdown_table(doc, table_buf)
            table_buf.clear()

    for line in lines:
        stripped = line.strip()

        # Code block toggle
        if stripped.startswith("```"):
            in_code = not in_code
            flush_table()
            continue

        if in_code:
            continue  # skip code block content (planning handled separately)

        # Blank line
        if not stripped:
            flush_table()
            continue

        # Markdown table line
        if stripped.startswith("|"):
            table_buf.append(stripped)
            continue
        else:
            flush_table()

        # Horizontal rule
        if re.match(r"^[-*_]{3,}$", stripped):
            continue

        # Headings (####, ###, ##, #)
        heading_m = re.match(r"^(#{1,4})\s+(.+)", stripped)
        if heading_m:
            depth = len(heading_m.group(1))
            title = _strip_md(heading_m.group(2))
            # Skip if it's a duplicate of the section heading we already added
            if not section_heading_skipped:
                section_heading_skipped = True
                continue
            level = min(depth + 1, 4)
            doc.add_heading(title, level=level)
            continue

        # Standalone bold line used as a sub-heading (e.g. **A. Équipements**)
        if re.match(r"^\*\*.+\*\*$", stripped) and len(stripped) < 80:
            doc.add_heading(_strip_md(stripped), level=3)
            continue

        # Bullet list
        if re.match(r"^[-*✅✔►]\s+", stripped):
            content = re.sub(r"^[-*✅✔►]\s+", "", stripped)
            _add_rich_paragraph(doc, content, style="List Bullet")
            continue

        # Normal paragraph
        _add_rich_paragraph(doc, stripped)

    flush_table()


def _add_cover(doc: Document, cps: CPSContext, company_name: str) -> None:
    doc.add_paragraph()
    title = doc.add_heading("OFFRE TECHNIQUE", level=0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER

    doc.add_paragraph()
    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = sub.add_run(f"Appel d'offres : {cps.reference or 'N/A'}")
    run.font.size = Pt(14)

    if cps.acheteur:
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.add_run(f"Acheteur : {cps.acheteur}").font.size = Pt(12)

    if company_name:
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.add_run(f"Soumissionnaire : {company_name}").font.size = Pt(12)

    doc.add_page_break()


def build_docx(
    sections: dict[str, str],
    cps: CPSContext,
    company_info: dict,
    output_path: Path,
) -> Path:
    doc          = Document()
    company_name = company_info.get("company_name", "")

    _add_cover(doc, cps, company_name)

    for key, title in SECTION_TITLES.items():
        doc.add_heading(title, level=1)
        text = sections.get(key, "")

        if key == "planning":
            _add_planning_table(doc, text)
        else:
            _render_section(doc, text)

        doc.add_page_break()

    doc.save(str(output_path))
    return output_path


def build_pdf(docx_path: Path) -> Path | None:
    """Convert DOCX to PDF via LibreOffice headless. Returns None if unavailable."""
    pdf_path = docx_path.with_suffix(".pdf")
    try:
        result = subprocess.run(
            [
                "libreoffice", "--headless", "--convert-to", "pdf",
                "--outdir", str(docx_path.parent),
                str(docx_path),
            ],
            capture_output=True,
            timeout=60,
        )
        if result.returncode == 0 and pdf_path.exists():
            return pdf_path
        logger.warning("LibreOffice conversion failed: %s", result.stderr.decode())
        return None
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        logger.info("LibreOffice non disponible : %s", e)
        return None
