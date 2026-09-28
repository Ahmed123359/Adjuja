# -- coding: utf-8 --
"""
Assembleur DOCX pour l'offre technique  10 sections (skill ABI Consulting).
"""
import io
import json
import logging
import re
import subprocess
from datetime import date
from pathlib import Path

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT

from app.models.offre_technique import CPSContext

logger = logging.getLogger(__name__)

# ── Palette par défaut ───────────────────────────────────────────────────────
_H1_COLOR     = "1F3864"
_H2_COLOR     = "2C3E50"
_H3_COLOR     = "34495E"
_BODY_COLOR   = "1A1A1A"
_TABLE_HEADER = "1F3864"
_ACCENT       = "2E86C1"
_FONT         = "Times New Roman"

_BOLD_RE   = re.compile(r"\*\*(.+?)\*\*")
_ITALIC_RE = re.compile(r"\*([^*\n]+?)\*")
_AI_NOISE_RE = re.compile(
    r"^(voici\s|cette section |ce planning |en résumé[,\s]|"
    r"notre (approche|méthodologie|engagement)|note\s*:|nb\s*:|ps\s*:)",
    re.IGNORECASE,
)
_META_NOTE_RE = re.compile(r"^\*?\([^)]{3,}\)\*?\.?$")


# ── XML / formatage helpers ──────────────────────────────────────────────────

def _set_table_style(table, style_name: str = "Table Grid") -> None:
    """Applique un style de tableau, silently ignore si absent du template."""
    try:
        table.style = style_name
    except KeyError:
        pass


def _hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _force_font(run, size_pt: float) -> None:
    rpr = run._r.get_or_add_rPr()
    rfonts = OxmlElement("w:rFonts")
    for attr in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        rfonts.set(qn(attr), _FONT)
    rpr.insert(0, rfonts)
    run.font.size = Pt(size_pt)


def _set_doc_defaults(doc: Document) -> None:
    styles_el = doc.styles.element
    doc_defaults = styles_el.find(qn("w:docDefaults"))
    if doc_defaults is None:
        return
    rpr_default = doc_defaults.find(f".//{qn('w:rPrDefault')}/{qn('w:rPr')}")
    if rpr_default is None:
        return
    rfonts = OxmlElement("w:rFonts")
    for attr in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        rfonts.set(qn(attr), _FONT)
    rpr_default.insert(0, rfonts)


def _para_format(para, space_after: int = 6, line_spacing: float = 1.15,
                 align=WD_ALIGN_PARAGRAPH.JUSTIFY) -> None:
    para.alignment = align
    fmt = para.paragraph_format
    fmt.space_after  = Pt(space_after)
    fmt.line_spacing = Pt(11 * line_spacing)


def _clean_br(text: str) -> str:
    return re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)


def _strip_md(text: str) -> str:
    text = _clean_br(text)
    return _BOLD_RE.sub(r"\1", text).replace("*", "").strip()


def _add_rich_paragraph(doc: Document, text: str, style: str | None = None,
                         size: float = 11, color_hex: str = _BODY_COLOR) -> None:
    try:
        p = doc.add_paragraph(style=style) if style else doc.add_paragraph()
    except KeyError:
        p = doc.add_paragraph()
    _para_format(p)
    text = re.sub(r"^[✅✔☑►•·]\s*", "", text.strip())
    text = _ITALIC_RE.sub(r"**\1**", text)
    parts = _BOLD_RE.split(text)
    r, g, b = _hex_to_rgb(color_hex)
    for i, part in enumerate(parts):
        if not part:
            continue
        run = p.add_run(part.replace("*", ""))
        run.bold = bool(i % 2)
        run.font.color.rgb = RGBColor(r, g, b)
        _force_font(run, size)


def _add_heading(doc: Document, text: str, level: int, color_hex: str) -> None:
    try:
        p = doc.add_heading(text, level=level)
    except KeyError:
        p = doc.add_paragraph()
        p.add_run(text).bold = True
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.space_before = Pt(12 if level == 1 else 8)
    size = 14 if level == 1 else 12 if level == 2 else 11
    r, g, b = _hex_to_rgb(color_hex)
    for run in p.runs:
        run.font.color.rgb = RGBColor(r, g, b)
        _force_font(run, size)


def _add_markdown_table(doc: Document, lines: list[str], header_color: str) -> None:
    rows = []
    for line in lines:
        stripped = line.strip().strip("|")
        if re.match(r"^[\s\-|:]+$", stripped):
            continue
        cells = [c.strip() for c in stripped.split("|")]
        if any(cells):
            rows.append(cells)
    if not rows:
        return
    cols = max(len(r) for r in rows)
    table = doc.add_table(rows=len(rows), cols=cols)
    _set_table_style(table)
    r, g, b = _hex_to_rgb(header_color)
    for i, row in enumerate(rows):
        for j in range(cols):
            cell_text = row[j] if j < len(row) else ""
            cell = table.rows[i].cells[j]
            para = cell.paragraphs[0]
            para.alignment = WD_ALIGN_PARAGRAPH.CENTER if i == 0 else WD_ALIGN_PARAGRAPH.LEFT
            run  = para.add_run(_strip_md(cell_text))
            _force_font(run, 10)
            if i == 0:
                run.bold = True
                run.font.color.rgb = RGBColor(255, 255, 255)
                tc_pr = cell._tc.get_or_add_tcPr()
                shd   = OxmlElement("w:shd")
                shd.set(qn("w:val"),   "clear")
                shd.set(qn("w:color"), "auto")
                shd.set(qn("w:fill"),  header_color)
                tc_pr.append(shd)
    doc.add_paragraph()


# ── Gantt matplotlib ─────────────────────────────────────────────────────────

def _build_gantt(phases: list[dict], brand_color: str) -> bytes | None:
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        n = len(phases)
        fig, ax = plt.subplots(figsize=(14, max(3, n * 0.7 + 1)))
        ax.set_facecolor("#FAFAFA")
        fig.patch.set_facecolor("white")

        main_color = f"#{brand_color.lstrip('#')}" if brand_color else f"#{_H1_COLOR}"
        alt_color  = f"#{_ACCENT}"

        for i, phase in enumerate(phases):
            color = main_color if i % 2 == 0 else alt_color
            label = phase.get("nom", f"Phase {i+1}")
            duree = phase.get("duree", "")
            ax.barh(i, 1, left=i, color=color, edgecolor="white", height=0.65)
            ax.text(i + 0.5, i, f"{label}\n{duree}", va="center", ha="center",
                    fontsize=7.5, color="white", fontweight="bold", fontfamily="DejaVu Sans")

        ax.set_yticks(range(n))
        ax.set_yticklabels([p.get("nom", "") for p in phases], fontsize=8)
        ax.set_xticks([])
        ax.invert_yaxis()
        ax.set_title("Planning d'exécution", fontsize=11, fontweight="bold",
                     color=f"#{_H1_COLOR}", fontfamily="DejaVu Sans", pad=10)
        for spine in ("top", "right", "bottom"):
            ax.spines[spine].set_visible(False)

        buf = io.BytesIO()
        plt.savefig(buf, format="png", dpi=150, bbox_inches="tight")
        plt.close(fig)
        buf.seek(0)
        return buf.read()
    except Exception as exc:
        logger.warning("Gantt generation failed: %s", exc)
        return None


# ── Planning ─────────────────────────────────────────────────────────────────

_DEFAULT_PHASES = [
    {"nom": "Phase 1 : Cadrage", "duree": "2 semaines",
     "activites": ["Réunion de lancement", "Collecte données"], "jalons": ["Plan validé"], "livrables": ["Rapport de démarrage"]},
    {"nom": "Phase 2 : Exécution", "duree": "8 semaines",
     "activites": ["Mise en oeuvre des activités"], "jalons": ["Mi-parcours"], "livrables": ["Rapports d'avancement"]},
    {"nom": "Phase 3 : Clôture", "duree": "2 semaines",
     "activites": ["Restitution", "Rapport final"], "jalons": ["Validation MO"], "livrables": ["Rapport final validé"]},
]


def _add_planning_section(doc: Document, planning_text: str,
                           header_color: str, brand_color: str | None) -> list[dict]:
    phases = _DEFAULT_PHASES
    try:
        clean = re.sub(r"```(?:json)?\s*", "", planning_text, flags=re.IGNORECASE).strip()
        clean = re.sub(r"```\s*$", "", clean, flags=re.IGNORECASE).strip()
        m = re.search(r"\{.*\}", clean, re.DOTALL)
        if m:
            data = json.loads(m.group(0))
            if "phases" not in data:
                for v in data.values():
                    if isinstance(v, dict) and "phases" in v:
                        data = v
                        break
            if data.get("phases"):
                phases = data["phases"]
            narrative = data.get("description", "")
            if narrative:
                _add_rich_paragraph(doc, narrative)
    except (json.JSONDecodeError, KeyError):
        _render_section(doc, planning_text, header_color)

    # Gantt chart
    gantt_png = _build_gantt(phases, brand_color or "")
    if gantt_png:
        doc.add_paragraph()
        doc.add_picture(io.BytesIO(gantt_png), width=Inches(6.2))
        cap = doc.add_paragraph("Figure : Planning d'exécution de la mission")
        cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for run in cap.runs:
            run.font.size = Pt(9)
            run.font.italic = True
            _force_font(run, 9)
        doc.add_paragraph()
    else:
        # Fallback Word table
        hdr_labels = ["Phase", "Durée", "Activités principales", "Livrables"]
        table = doc.add_table(rows=1, cols=4)
        _set_table_style(table)
        r, g, b = _hex_to_rgb(header_color)
        for j, h in enumerate(hdr_labels):
            cell = table.rows[0].cells[j]
            para = cell.paragraphs[0]
            run  = para.add_run(h)
            run.bold = True
            run.font.color.rgb = RGBColor(255, 255, 255)
            _force_font(run, 10)
            tc_pr = cell._tc.get_or_add_tcPr()
            shd   = OxmlElement("w:shd")
            shd.set(qn("w:val"), "clear"); shd.set(qn("w:color"), "auto"); shd.set(qn("w:fill"), header_color)
            tc_pr.append(shd)
        for phase in phases:
            row = table.add_row().cells
            row[0].text = phase.get("nom", "")
            row[1].text = phase.get("duree", "")
            row[2].text = "\n".join(phase.get("activites", phase.get("jalons", [])))
            row[3].text = "\n".join(phase.get("livrables", []))
        doc.add_paragraph()

    return phases


# ── Tableau équipe ────────────────────────────────────────────────────────────

def _add_team_table(doc: Document, team_members: list[dict], header_color: str) -> None:
    if not team_members:
        _add_rich_paragraph(doc, "L'équipe sera constituée d'experts qualifiés conformément aux exigences du CPS.")
        return

    headers = ["Expert", "Rôle dans la mission", "Diplôme", "Spécialité", "Expérience"]
    table   = doc.add_table(rows=1, cols=len(headers))
    _set_table_style(table)
    r, g, b = _hex_to_rgb(header_color)

    for j, h in enumerate(headers):
        cell = table.rows[0].cells[j]
        para = cell.paragraphs[0]
        run  = para.add_run(h)
        run.bold = True
        run.font.color.rgb = RGBColor(255, 255, 255)
        _force_font(run, 9.5)
        tc_pr = cell._tc.get_or_add_tcPr()
        shd   = OxmlElement("w:shd")
        shd.set(qn("w:val"), "clear"); shd.set(qn("w:color"), "auto"); shd.set(qn("w:fill"), header_color)
        tc_pr.append(shd)

    for m in team_members:
        cv = m.get("cv") or {}
        nom    = f"{cv.get('nom', '')} {cv.get('prenom', '')}".strip() or "Expert"
        role   = m.get("role_dans_offre") or cv.get("poste", "")
        diplome = cv.get("diplome", "")
        spec   = cv.get("specialite", "")
        exp    = f"{cv.get('annees_experience', '')} ans" if cv.get("annees_experience") else ""

        row = table.add_row().cells
        for j, val in enumerate([nom, role, diplome, spec, exp]):
            para = row[j].paragraphs[0]
            run  = para.add_run(val)
            _force_font(run, 9.5)
            if m.get("warning") and j == 0:
                run.font.color.rgb = RGBColor(220, 38, 38)

    doc.add_paragraph()

    # Mention des warnings
    warnings = [m for m in team_members if m.get("warning")]
    if warnings:
        note = doc.add_paragraph()
        _para_format(note)
        run = note.add_run("⚠ Profils requis non couverts par les CVs disponibles : ")
        run.bold = True
        _force_font(run, 10)
        run2 = note.add_run(", ".join(m.get("role_dans_offre", "") for m in warnings))
        run2.font.color.rgb = RGBColor(220, 38, 38)
        _force_font(run2, 10)


# ── Chronogramme d'affectation ────────────────────────────────────────────────

def _add_chronogramme(doc: Document, team_members: list[dict],
                       phases: list[dict], header_color: str) -> None:
    if not team_members or not phases:
        _add_rich_paragraph(doc, "Le chronogramme d'affectation détaillé sera fourni lors de la réunion de lancement.")
        return

    experts = []
    for m in team_members:
        cv  = m.get("cv") or {}
        nom = f"{cv.get('nom', '')} {cv.get('prenom', '')}".strip() or "Expert"
        role = m.get("role_dans_offre") or cv.get("poste", "")
        if nom:
            experts.append({"nom": nom, "role": role})

    if not experts:
        return

    headers = ["Expert / Rôle"] + [p.get("nom", f"Phase {i+1}") for i, p in enumerate(phases)] + ["Total J/H"]
    table   = doc.add_table(rows=1, cols=len(headers))
    _set_table_style(table)
    r, g, b = _hex_to_rgb(header_color)

    for j, h in enumerate(headers):
        cell = table.rows[0].cells[j]
        para = cell.paragraphs[0]
        run  = para.add_run(h[:25] if len(h) > 25 else h)
        run.bold = True
        run.font.color.rgb = RGBColor(255, 255, 255)
        _force_font(run, 8)
        tc_pr = cell._tc.get_or_add_tcPr()
        shd   = OxmlElement("w:shd")
        shd.set(qn("w:val"), "clear"); shd.set(qn("w:color"), "auto"); shd.set(qn("w:fill"), header_color)
        tc_pr.append(shd)

    days_per_phase = 10
    for expert in experts:
        row    = table.add_row().cells
        total  = days_per_phase * len(phases)
        row[0].text = f"{expert['nom']}\n({expert['role']})"
        for j in range(1, len(phases) + 1):
            row[j].text = str(days_per_phase)
        row[-1].text = str(total)
        for j in range(len(row)):
            for run in row[j].paragraphs[0].runs:
                _force_font(run, 9)

    doc.add_paragraph()
    note = doc.add_paragraph("Note : Le chronogramme ci-dessus est indicatif. Il sera ajusté lors de la réunion de lancement en accord avec le Maître d'Ouvrage.")
    _para_format(note)
    for run in note.runs:
        run.font.italic = True
        _force_font(run, 9)


# ── Section renderer ─────────────────────────────────────────────────────────

def _render_section(doc: Document, text: str, h1_color: str) -> None:
    text    = _clean_br(text)
    lines   = text.split("\n")
    in_code = False
    table_buf: list[str] = []
    first_heading_skipped = False

    def flush_table() -> None:
        if table_buf:
            _add_markdown_table(doc, table_buf, h1_color)
            table_buf.clear()

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("```"):
            in_code = not in_code
            flush_table()
            continue
        if in_code:
            continue
        if not stripped:
            flush_table()
            continue
        if stripped.startswith("|"):
            table_buf.append(stripped)
            continue
        else:
            flush_table()

        if re.match(r"^[-*_]{3,}$", stripped):
            continue
        if _AI_NOISE_RE.search(stripped) or _META_NOTE_RE.match(stripped):
            continue

        heading_m = re.match(r"^(#{1,4})\s+(.+)", stripped)
        if heading_m:
            if not first_heading_skipped:
                first_heading_skipped = True
                continue
            depth = len(heading_m.group(1))
            title = _strip_md(heading_m.group(2))
            color = h1_color if depth <= 2 else _H2_COLOR
            _add_heading(doc, title, min(depth + 1, 4), color)
            continue

        if re.match(r"^\*\*.+\*\*$", stripped) and len(stripped) < 80:
            _add_heading(doc, _strip_md(stripped), 3, _H2_COLOR)
            continue

        if re.match(r"^[-*✅✔►]\s+", stripped):
            content = re.sub(r"^[-*✅✔►]\s+", "", stripped)
            _add_rich_paragraph(doc, content, style="List Bullet")
            continue

        _add_rich_paragraph(doc, stripped)

    flush_table()


# ── Page de garde ─────────────────────────────────────────────────────────────

def _add_cover(
    doc: Document,
    cps: CPSContext,
    company_info: dict,
    logo_bytes: bytes | None,
    brand_color: str | None,
) -> None:
    h_color = brand_color or f"#{_H1_COLOR}"
    r, g, b = _hex_to_rgb(h_color.lstrip("#"))
    company_name = company_info.get("company_name", "")

    # Logo en haut à droite
    if logo_bytes:
        try:
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            run = p.add_run()
            run.add_picture(io.BytesIO(logo_bytes), height=Inches(0.9))
        except Exception as exc:
            logger.warning("Logo insertion failed: %s", exc)

    # Espacement
    for _ in range(3):
        doc.add_paragraph()

    # Titre principal
    title = doc.add_heading("OFFRE TECHNIQUE", level=0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for run in title.runs:
        run.font.color.rgb = RGBColor(r, g, b)
        _force_font(run, 26)

    doc.add_paragraph()

    # Intitulé du marché
    intitule = getattr(cps, "intitule", None) or cps.scope
    if intitule:
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(intitule)
        run.bold = True
        run.font.color.rgb = RGBColor(r, g, b)
        _force_font(run, 14)

    doc.add_paragraph()

    # Infos AO dans un tableau centré
    info_rows = []
    if cps.reference:
        info_rows.append(("Référence AO", cps.reference))
    if cps.acheteur:
        info_rows.append(("Maître d'Ouvrage", cps.acheteur))
    if company_name:
        info_rows.append(("Soumissionnaire", company_name))
    info_rows.append(("Date de soumission", date.today().strftime("%d/%m/%Y")))

    if info_rows:
        table = doc.add_table(rows=len(info_rows), cols=2)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        _set_table_style(table)
        for i, (label, value) in enumerate(info_rows):
            row = table.rows[i]
            # Label
            label_cell = row.cells[0]
            label_run  = label_cell.paragraphs[0].add_run(label)
            label_run.bold = True
            label_run.font.color.rgb = RGBColor(255, 255, 255)
            _force_font(label_run, 11)
            tc_pr = label_cell._tc.get_or_add_tcPr()
            shd   = OxmlElement("w:shd")
            shd.set(qn("w:val"), "clear"); shd.set(qn("w:color"), "auto")
            shd.set(qn("w:fill"), h_color.lstrip("#"))
            tc_pr.append(shd)
            # Value
            val_run = row.cells[1].paragraphs[0].add_run(value)
            _force_font(val_run, 11)

    doc.add_page_break()


# ── Sommaire (placeholder TOC) ────────────────────────────────────────────────

def _add_toc(doc: Document, h1_color: str) -> None:
    _add_heading(doc, "Sommaire", level=1, color_hex=h1_color)
    toc_entries = [
        ("1.", "Page de garde"),
        ("2.", "Sommaire"),
        ("3.", "Présentation du Cabinet et Références"),
        ("4.", "Compréhension du Contexte"),
        ("5.", "Compréhension de la Mission"),
        ("6.", "Approche Méthodologique"),
        ("7.", "Équipe Proposée"),
        ("8.", "Planning d'Exécution"),
        ("9.", "Chronogramme d'Affectation du Personnel"),
        ("10.", "Annexes"),
    ]
    for num, title in toc_entries:
        p = doc.add_paragraph()
        _para_format(p, space_after=3)
        run1 = p.add_run(f"{num} ")
        run1.bold = True
        _force_font(run1, 11)
        run2 = p.add_run(title)
        _force_font(run2, 11)
    doc.add_paragraph()
    note = doc.add_paragraph("(Mise à jour automatique du sommaire dans Word : Ctrl+A puis F9)")
    for run in note.runs:
        run.font.italic = True
        run.font.color.rgb = RGBColor(128, 128, 128)
        _force_font(run, 9)
    doc.add_page_break()


# ── Header/Footer ─────────────────────────────────────────────────────────────

def _add_header_footer(doc: Document, cps: CPSContext, company_name: str) -> None:
    try:
        section = doc.sections[0]
        header  = section.header
        footer  = section.footer

        # Header : intitule mission | nom cabinet
        hdr_p = header.paragraphs[0] if header.paragraphs else header.add_paragraph()
        hdr_p.clear()
        hdr_p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        intitule = getattr(cps, "intitule", None) or cps.scope or "Offre Technique"
        run = hdr_p.add_run(f"{intitule[:60]}{'...' if len(intitule) > 60 else ''} | {company_name}")
        run.font.size = Pt(8)
        run.font.color.rgb = RGBColor(100, 100, 100)
        _force_font(run, 8)

        # Footer : page number | confidentiel
        ftr_p = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
        ftr_p.clear()
        ftr_p.alignment = WD_ALIGN_PARAGRAPH.CENTER

        run1 = ftr_p.add_run("Confidentiel  ")
        run1.font.size = Pt(8)
        _force_font(run1, 8)

        fldChar1 = OxmlElement("w:fldChar")
        fldChar1.set(qn("w:fldCharType"), "begin")
        instrText = OxmlElement("w:instrText")
        instrText.set(qn("xml:space"), "preserve")
        instrText.text = " PAGE "
        fldChar3 = OxmlElement("w:fldChar")
        fldChar3.set(qn("w:fldCharType"), "end")

        run2 = ftr_p.add_run()
        run2._r.append(fldChar1)
        run2._r.append(instrText)
        run2._r.append(fldChar3)
        _force_font(run2, 8)
    except Exception as exc:
        logger.warning("Header/footer setup failed: %s", exc)


# ── Assemblage principal ──────────────────────────────────────────────────────

SECTION_CONFIG = [
    # (key, titre_section, is_planning, is_team, is_chronogramme)
    ("presentation_cabinet",   "Présentation du Cabinet et Références",    False, False, False),
    ("comprehension_contexte", "Compréhension du Contexte",                False, False, False),
    ("comprehension_mission",  "Compréhension de la Mission",              False, False, False),
    ("methodologie",           "Approche Méthodologique",                  False, False, False),
    ("_equipe",                "Équipe Proposée",                          False, True,  False),
    ("planning",               "Planning d'Exécution",                     True,  False, False),
    ("_chronogramme",          "Chronogramme d'Affectation du Personnel",  False, False, True),
    ("rse",                    "Démarche RSE et Développement Durable",    False, False, False),
]


def _open_from_template(template_bytes: bytes) -> Document:
    """
    Ouvre un Document depuis un template DOCX fourni par l'org.
    Vide le corps (body) tout en conservant :
      - les styles (Heading 1/2, Normal, etc.)
      - le header (logo, nom entreprise)
      - le footer (pagination, mentions)
      - les marges et paramètres de page (sectPr)
    """
    import io as _io
    doc  = Document(_io.BytesIO(template_bytes))
    body = doc.element.body
    sect_pr = body.find(qn("w:sectPr"))
    for element in list(body):
        tag = element.tag.split("}")[-1] if "}" in element.tag else element.tag
        if tag != "sectPr":
            body.remove(element)
    if sect_pr is not None and body.find(qn("w:sectPr")) is None:
        body.append(sect_pr)
    return doc


def build_docx(
    sections:       dict[str, str],
    cps:            CPSContext,
    company_info:   dict,
    output_path:    Path,
    logo_bytes:     bytes | None      = None,
    logo_filename:  str | None        = None,
    brand_color:    str | None        = None,
    team_members:   list[dict] | None = None,
    template_bytes: bytes | None      = None,
) -> Path:
    company_name = company_info.get("company_name", "")
    h1_color     = brand_color.lstrip("#") if brand_color else _H1_COLOR

    if template_bytes:
        try:
            doc = _open_from_template(template_bytes)
            logger.info("Template DOCX org utilisé pour la note méthodologique")
        except Exception as exc:
            logger.warning("Template DOCX invalide, fallback design par défaut : %s", exc)
            doc = Document()
            _set_doc_defaults(doc)
            _add_header_footer(doc, cps, company_name)
    else:
        doc = Document()
        _set_doc_defaults(doc)
        _add_header_footer(doc, cps, company_name)

    # 1. Page de garde (ajoutée dans les deux cas)
    _add_cover(doc, cps, company_info, logo_bytes, brand_color)

    # 2. Sommaire
    _add_toc(doc, h1_color)

    # 3-10. Sections
    phases: list[dict] = []
    section_num = 3

    for key, title, is_planning, is_team, is_chrono in SECTION_CONFIG:
        _add_heading(doc, f"{section_num}. {title}", level=1, color_hex=h1_color)

        if is_planning:
            phases = _add_planning_section(doc, sections.get("planning", ""), h1_color, brand_color)
        elif is_team:
            _add_team_table(doc, team_members or [], h1_color)
        elif is_chrono:
            _add_chronogramme(doc, team_members or [], phases, h1_color)
        else:
            text = sections.get(key, "")
            _render_section(doc, text, h1_color)

        section_num += 1
        doc.add_page_break()

    # 10. Annexes
    _add_heading(doc, f"{section_num}. Annexes", level=1, color_hex=h1_color)
    annexes = [
        "CV détaillés des experts (joints en annexe)",
        "Attestations de références similaires",
        "Documents administratifs du cabinet",
    ]
    if team_members:
        for m in team_members:
            cv = m.get("cv") or {}
            nom = f"{cv.get('nom', '')} {cv.get('prenom', '')}".strip()
            if nom and cv.get("cv_url"):
                annexes.append(f"CV de {nom}  {m.get('role_dans_offre', '')}")
    for ann in annexes:
        _add_rich_paragraph(doc, f"• {ann}")

    doc.save(str(output_path))
    return output_path


def build_pdf(docx_path: Path) -> Path | None:
    pdf_path = docx_path.with_suffix(".pdf")
    try:
        import tempfile, os
        lo_profile = tempfile.mkdtemp(prefix="lo_profile_")
        env = {**os.environ, "HOME": lo_profile}
        result = subprocess.run(
            [
                "libreoffice",
                f"-env:UserInstallation=file://{lo_profile}",
                "--headless", "--norestore",
                "--convert-to", "pdf",
                "--outdir", str(docx_path.parent),
                str(docx_path),
            ],
            capture_output=True, timeout=120, env=env,
        )
        if result.returncode == 0 and pdf_path.exists():
            return pdf_path
        logger.warning("LibreOffice conversion failed: %s", result.stderr.decode())
        return None
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        logger.info("LibreOffice non disponible : %s", e)
        return None
