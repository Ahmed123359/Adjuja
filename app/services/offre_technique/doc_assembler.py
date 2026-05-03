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


def _add_planning_table(doc: Document, planning_text: str) -> None:
    """Extrait le JSON de planning et génère un tableau Gantt natif Word."""
    try:
        m = re.search(r"\{.*\}", planning_text, re.DOTALL)
        if not m:
            doc.add_paragraph(planning_text)
            return

        data     = json.loads(m.group(0))
        phases   = data.get("phases", [])
        narrative = data.get("description", "")

        if phases:
            table = doc.add_table(rows=1, cols=4)
            table.style = "Table Grid"
            hdr = table.rows[0].cells
            for i, h in enumerate(["Phase", "Durée", "Jalons", "Livrables"]):
                hdr[i].text = h
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

    except (json.JSONDecodeError, KeyError):
        doc.add_paragraph(planning_text)


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
            for line in text.split("\n"):
                line = line.strip()
                if not line:
                    continue
                if line.startswith("## ") or line.startswith("### "):
                    level = 2 if line.startswith("## ") else 3
                    doc.add_heading(line.lstrip("# ").strip(), level=level)
                elif line.startswith("- ") or line.startswith("* "):
                    p = doc.add_paragraph(line[2:], style="List Bullet")
                else:
                    doc.add_paragraph(line)

        doc.add_page_break()

    doc.save(str(output_path))
    return output_path


def build_pdf(docx_path: Path) -> Path | None:
    """Convertit DOCX -> PDF via LibreOffice headless. Retourne None si non dispo."""
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
