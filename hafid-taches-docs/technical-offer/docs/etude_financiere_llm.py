# -- coding: utf-8 --
"""
Génération du document d'étude financière LLM pour ADJUJA.
"""
from docx import Document
from docx.shared import Pt, RGBColor, Inches, Cm
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.section import WD_SECTION
import copy


# ── Constantes de style ───────────────────────────────────────────────────────

FONT_NAME   = "Times New Roman"
COLOR_H1    = RGBColor(0x1F, 0x38, 0x64)
COLOR_H2    = RGBColor(0x2C, 0x3E, 0x50)
COLOR_BODY  = RGBColor(0x00, 0x00, 0x00)
COLOR_NOTE  = RGBColor(0x55, 0x55, 0x55)
COLOR_TABLE_HEADER = RGBColor(0x1F, 0x38, 0x64)

SIZE_BODY = Pt(11)
SIZE_H1   = Pt(13)
SIZE_H2   = Pt(12)


# ── Helpers XML ───────────────────────────────────────────────────────────────

def _force_tnr(run, size: Pt) -> None:
    """Force Times New Roman sur un run, en effaçant les références thème."""
    rpr = run._r.get_or_add_rPr()
    # Supprimer les rFonts existants
    for existing in rpr.findall(qn("w:rFonts")):
        rpr.remove(existing)
    rfonts = OxmlElement("w:rFonts")
    rfonts.set(qn("w:ascii"),         FONT_NAME)
    rfonts.set(qn("w:hAnsi"),         FONT_NAME)
    rfonts.set(qn("w:cs"),            FONT_NAME)
    # Supprimer les attributs thème
    for attr in (qn("w:asciiTheme"), qn("w:hAnsiTheme"),
                 qn("w:cstheme"),    qn("w:eastAsiaTheme")):
        if attr in rfonts.attrib:
            del rfonts.attrib[attr]
    rpr.insert(0, rfonts)
    run.font.size = size


def _set_doc_defaults(doc: Document) -> None:
    """Applique Times New Roman aux docDefaults."""
    styles_el = doc.styles.element
    doc_defaults = styles_el.find(qn("w:docDefaults"))
    if doc_defaults is None:
        return
    rpr_default = doc_defaults.find(
        f".//{qn('w:rPrDefault')}/{qn('w:rPr')}"
    )
    if rpr_default is None:
        return
    for existing in rpr_default.findall(qn("w:rFonts")):
        rpr_default.remove(existing)
    rfonts = OxmlElement("w:rFonts")
    rfonts.set(qn("w:ascii"), FONT_NAME)
    rfonts.set(qn("w:hAnsi"), FONT_NAME)
    rfonts.set(qn("w:cs"),    FONT_NAME)
    rpr_default.insert(0, rfonts)


def para_format(para, space_after: int = 6, line_spacing: float = 1.15) -> None:
    para.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    fmt = para.paragraph_format
    fmt.space_after  = Pt(space_after)
    fmt.line_spacing = Pt(11 * line_spacing)


# ── Constructeurs de blocs ────────────────────────────────────────────────────

def add_h1(doc: Document, text: str) -> None:
    p = doc.add_paragraph()
    para_format(p, space_after=8)
    p.paragraph_format.space_before = Pt(14)
    run = p.add_run(text)
    run.bold = True
    run.font.color.rgb = COLOR_H1
    _force_tnr(run, SIZE_H1)


def add_h2(doc: Document, text: str) -> None:
    p = doc.add_paragraph()
    para_format(p, space_after=6)
    p.paragraph_format.space_before = Pt(10)
    run = p.add_run(text)
    run.bold = True
    run.font.color.rgb = COLOR_H2
    _force_tnr(run, SIZE_H2)


def add_body(doc: Document, text: str, bold: bool = False) -> None:
    p = doc.add_paragraph()
    para_format(p)
    run = p.add_run(text)
    run.bold = bold
    run.font.color.rgb = COLOR_BODY
    _force_tnr(run, SIZE_BODY)


def add_note(doc: Document, text: str) -> None:
    p = doc.add_paragraph()
    para_format(p, space_after=4)
    run = p.add_run(text)
    run.font.color.rgb = COLOR_NOTE
    run.font.italic = True
    _force_tnr(run, Pt(10))


def add_table(doc: Document, headers: list, rows: list, col_widths: list = None) -> None:
    """Crée un tableau formaté Times New Roman avec en-tête marine."""
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    # En-tête
    hdr_cells = table.rows[0].cells
    for i, h in enumerate(headers):
        cell = hdr_cells[i]
        para = cell.paragraphs[0]
        para.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        run = para.add_run(h)
        run.bold = True
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        _force_tnr(run, Pt(10))
        # Fond marine
        tc_pr = cell._tc.get_or_add_tcPr()
        shd = OxmlElement("w:shd")
        shd.set(qn("w:val"),   "clear")
        shd.set(qn("w:color"), "auto")
        shd.set(qn("w:fill"),  "1F3864")
        tc_pr.append(shd)

    # Données
    for r_idx, row_data in enumerate(rows):
        row_cells = table.rows[r_idx + 1].cells
        fill = "F2F2F2" if r_idx % 2 == 0 else "FFFFFF"
        for c_idx, val in enumerate(row_data):
            cell = row_cells[c_idx]
            para = cell.paragraphs[0]
            para.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            run = para.add_run(str(val))
            run.font.color.rgb = COLOR_BODY
            _force_tnr(run, Pt(10))
            tc_pr = cell._tc.get_or_add_tcPr()
            shd = OxmlElement("w:shd")
            shd.set(qn("w:val"),   "clear")
            shd.set(qn("w:color"), "auto")
            shd.set(qn("w:fill"),  fill)
            tc_pr.append(shd)

    # Bordures
    try:
        tbl_pr = table._tbl.get_or_add_tblPr()
        tbl_borders = OxmlElement("w:tblBorders")
        for side in ("top", "left", "bottom", "right", "insideH", "insideV"):
            border = OxmlElement(f"w:{side}")
            border.set(qn("w:val"),   "single")
            border.set(qn("w:sz"),    "4")
            border.set(qn("w:space"), "0")
            border.set(qn("w:color"), "BFBFBF")
            tbl_borders.append(border)
        tbl_pr.append(tbl_borders)
    except Exception:
        pass

    doc.add_paragraph()


# ── Données de l'étude ────────────────────────────────────────────────────────

PROVIDERS = [
    # (Fournisseur, Modele, input $/1M, output $/1M, tier)
    ("OpenAI",     "GPT-5.4",             2.50,  10.00, "premium"),
    ("OpenAI",     "GPT-5.4 mini",        0.25,   2.00, "economique"),
    ("OpenAI",     "GPT-5.4 nano",        0.05,   0.40, "economique"),
    ("OpenAI",     "GPT-5.2",             1.75,  14.00, "premium"),
    ("Anthropic",  "Claude Sonnet",       3.00,  15.00, "premium"),
    ("Anthropic",  "Claude Opus",         5.00,  25.00, "ultra-premium"),
    ("Anthropic",  "Claude Haiku",        1.00,   5.00, "standard"),
    ("Google",     "Gemini 2.5 Pro",      1.25,  10.00, "premium"),
    ("Google",     "Gemini 2.0 Flash",    0.10,   0.40, "economique"),
    ("DeepSeek",   "V4-Flash",            0.14,   0.28, "economique"),
    ("DeepSeek",   "V4-Pro",              1.74,   3.48, "standard"),
    ("Mistral",    "Large",               0.50,   1.50, "standard"),
    ("Mistral",    "Small",               0.10,   0.30, "economique"),
    ("Mistral",    "Embed",               0.10,   0.00, "economique"),
    ("xAI",        "Grok 4",              3.00,  15.00, "premium"),
    ("Meta",       "Llama 4 Maverick",    0.27,   0.85, "economique"),
]

# Profil d'appels LLM par AO (tokens en milliers)
# Avec offre technique
PIPELINE_FULL = {
    "Analyse AO (Large)":           {"in_k": 25,  "out_k": 2,  "calls": 1,  "model": "large"},
    "Matching equipe (Large)":      {"in_k": 5,   "out_k": 1,  "calls": 1,  "model": "large"},
    "Analyse CPS (Small)":          {"in_k": 20,  "out_k": 2,  "calls": 1,  "model": "small"},
    "Analyse RC (Small)":           {"in_k": 15,  "out_k": 1,  "calls": 1,  "model": "small"},
    "Strategie (Small)":            {"in_k": 5,   "out_k": 1,  "calls": 1,  "model": "small"},
    "Quality gate (Small)":         {"in_k": 10,  "out_k": 1,  "calls": 3,  "model": "small"},  # max
    "Sections OT (Large) min":      {"in_k": 8,   "out_k": 3,  "calls": 6,  "model": "large"},  # 6 sections
    "Sections OT (Large) max":      {"in_k": 8,   "out_k": 3,  "calls": 18, "model": "large"},  # 18 avec regen
    "Filler docs (Large)":          {"in_k": 5,   "out_k": 3,  "calls": 3,  "model": "large"},
    "RAG embed":                    {"in_k": 0.5, "out_k": 0,  "calls": 6,  "model": "embed"},
}

# Sans offre technique
PIPELINE_NO_OT = {
    "Analyse AO (Large)":           {"in_k": 25,  "out_k": 2,  "calls": 1,  "model": "large"},
    "Matching equipe (Large)":      {"in_k": 5,   "out_k": 1,  "calls": 1,  "model": "large"},
    "Filler docs (Large)":          {"in_k": 5,   "out_k": 3,  "calls": 3,  "model": "large"},
}

# Chatbot : par session de 10 messages
CHAT_PER_SESSION = {
    "embed_k":      5,    # 10 messages × 500 tokens
    "llm_in_k":    40,    # 10 × 4000 tokens (historique + RAG)
    "llm_out_k":   20,    # 10 × 2000 tokens
}


def compute_cost_ao(pipeline: dict, scenario: str,
                     large_in: float, large_out: float,
                     small_in: float, small_out: float,
                     embed_in: float) -> tuple:
    """
    Retourne (cout_min, cout_max) en dollars pour un AO.
    scenario : 'min' ou 'max'
    """
    cost = 0.0
    for name, cfg in pipeline.items():
        if "max" in name and scenario == "min":
            continue
        if "min" in name and scenario == "max":
            continue
        calls = cfg["calls"]
        in_k  = cfg["in_k"]
        out_k = cfg["out_k"]
        model = cfg["model"]
        if model == "large":
            cost += calls * (in_k * large_in + out_k * large_out) / 1000
        elif model == "small":
            cost += calls * (in_k * small_in + out_k * small_out) / 1000
        elif model == "embed":
            cost += calls * (in_k * embed_in) / 1000
    return cost


def compute_chat_cost(llm_in: float, llm_out: float, embed_in: float) -> float:
    """Retourne le coût d'une session chatbot de 10 messages."""
    embed_cost = CHAT_PER_SESSION["embed_k"] * embed_in / 1000
    llm_cost   = (CHAT_PER_SESSION["llm_in_k"] * llm_in +
                  CHAT_PER_SESSION["llm_out_k"] * llm_out) / 1000
    return embed_cost + llm_cost


# Providers sélectionnés pour les tableaux de coût (stack courante + alternatives)
SELECTED = [
    # (label, large_in, large_out, small_in, small_out, embed_in)
    ("Mistral (stack actuelle)", 0.50, 1.50, 0.10, 0.30, 0.10),
    ("OpenAI GPT-5.4",          2.50, 10.00, 0.25, 2.00, 0.10),
    ("OpenAI GPT-5.4 mini",     0.25, 2.00,  0.05, 0.40, 0.10),
    ("Anthropic Claude Sonnet", 3.00, 15.00, 1.00, 5.00, 0.10),
    ("Anthropic Claude Haiku",  1.00, 5.00,  0.50, 2.50, 0.10),
    ("Google Gemini 2.5 Pro",   1.25, 10.00, 0.10, 0.40, 0.10),
    ("Google Gemini 2.0 Flash", 0.10, 0.40,  0.10, 0.40, 0.10),
    ("DeepSeek V4-Flash",       0.14, 0.28,  0.14, 0.28, 0.10),
    ("DeepSeek V4-Pro",         1.74, 3.48,  0.14, 0.28, 0.10),
    ("xAI Grok 4",              3.00, 15.00, 1.00, 5.00, 0.10),
]


# ── Construction du document ──────────────────────────────────────────────────

def build_document() -> Document:
    doc = Document()
    _set_doc_defaults(doc)

    # Marges
    section = doc.sections[0]
    section.page_width    = Inches(8.27)
    section.page_height   = Inches(11.69)
    section.left_margin   = Inches(1.18)
    section.right_margin  = Inches(1.18)
    section.top_margin    = Inches(1.18)
    section.bottom_margin = Inches(1.0)

    # ── Page de titre ─────────────────────────────────────────────────────────
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(80)
    p.paragraph_format.space_after  = Pt(10)
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    r = p.add_run("ADJUJA")
    r.bold = True
    r.font.color.rgb = COLOR_H1
    _force_tnr(r, Pt(20))

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    p.paragraph_format.space_after = Pt(6)
    r = p.add_run("Etude financière de la consommation des API LLM")
    r.bold = True
    r.font.color.rgb = COLOR_H2
    _force_tnr(r, Pt(14))

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    p.paragraph_format.space_after = Pt(60)
    r = p.add_run("Tarification abonnement et analyse des coûts opérationnels")
    r.font.color.rgb = COLOR_NOTE
    _force_tnr(r, Pt(12))

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    r = p.add_run("Mai 2026")
    r.font.color.rgb = COLOR_NOTE
    _force_tnr(r, SIZE_BODY)

    doc.add_page_break()

    # ── Table des matières ────────────────────────────────────────────────────
    add_h1(doc, "Table des matières")
    toc = [
        ("1.", "Panorama des tarifs API LLM (mai 2026)"),
        ("2.", "Architecture des appels LLM dans ADJUJA"),
        ("3.", "Estimation des coûts avec le module offre technique"),
        ("3.1.", "Consommation par appel d'offres"),
        ("3.2.", "Projection mensuelle par fournisseur"),
        ("3.3.", "Recommandations tarifaires"),
        ("4.", "Estimation des coûts sans le module offre technique"),
        ("4.1.", "Consommation par appel d'offres"),
        ("4.2.", "Projection mensuelle par fournisseur"),
        ("4.3.", "Recommandations tarifaires"),
        ("5.", "Synthèse et recommandation finale"),
    ]
    for num, title in toc:
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p.paragraph_format.space_after = Pt(3)
        r = p.add_run(f"{num}   {title}")
        r.font.color.rgb = COLOR_BODY
        if "." not in num[1:]:
            r.bold = True
        _force_tnr(r, SIZE_BODY)

    doc.add_page_break()

    # ─────────────────────────────────────────────────────────────────────────
    # 1. PANORAMA DES TARIFS
    # ─────────────────────────────────────────────────────────────────────────
    add_h1(doc, "1. Panorama des tarifs API LLM (mai 2026)")
    add_body(doc,
        "Les prix des API de grands modèles de langage ont connu une baisse de l'ordre de 70 à 90 % "
        "entre 2024 et mai 2026. Deux dynamiques expliquent cette tendance : l'entrée agressive de "
        "DeepSeek sur le marché avec des modèles ouverts aux tarifs inférieurs de 90 % aux offres "
        "américaines, et la réponse en cascade des acteurs établis, qui ont réduit leurs prix pour "
        "préserver leurs parts de marché. Le tableau suivant présente les tarifs en vigueur au "
        "moment de la rédaction de cette étude."
    )

    add_h2(doc, "1.1. Tableau comparatif des prix au million de tokens")

    add_table(doc,
        headers=["Fournisseur", "Modèle", "Entrée ($/1M tokens)", "Sortie ($/1M tokens)", "Segment"],
        rows=[
            [p[0], p[1], f"${p[2]:.4f}", f"${p[3]:.4f}", p[4]] for p in PROVIDERS
        ]
    )

    add_note(doc,
        "Source : pages de tarification officielles des fournisseurs consultées en mai 2026. "
        "Les prix varient selon les remises promotionnelles, le cache de prompts et les accords volume. "
        "Mistral Embed n'a pas de prix de sortie car il ne génère que des vecteurs."
    )

    add_h2(doc, "1.2. Observations")
    add_body(doc,
        "DeepSeek V4-Flash constitue l'option la moins onéreuse parmi les modèles de capacité "
        "comparable à GPT-5.4 ou Claude Sonnet, à 0,14 dollar par million de tokens en entrée. "
        "Les modèles économiques de Google (Gemini Flash) et de Mistral (Small) se positionnent "
        "dans la même fourchette à 0,10 dollar par million."
    )
    add_body(doc,
        "Le cache de prompts, disponible chez Anthropic et OpenAI, réduit le coût effectif des "
        "requêtes répétitives jusqu'à 90 %. Cette fonctionnalité est particulièrement pertinente "
        "pour les appels qui intègrent un contexte documentaire stable, comme les appels filler "
        "ou les générations de sections à partir du même CPS."
    )

    doc.add_page_break()

    # ─────────────────────────────────────────────────────────────────────────
    # 2. ARCHITECTURE DES APPELS LLM
    # ─────────────────────────────────────────────────────────────────────────
    add_h1(doc, "2. Architecture des appels LLM dans ADJUJA")
    add_body(doc,
        "ADJUJA repose sur deux flux d'utilisation distincts : le pipeline de génération "
        "automatisé, déclenché à chaque appel d'offres, et le chatbot conversationnel, "
        "activé à la demande par l'utilisateur. Ces deux flux font l'objet d'une analyse "
        "séparée car leurs profils de consommation diffèrent structurellement."
    )

    add_h2(doc, "2.1. Le pipeline automatisé")
    add_body(doc,
        "Le pipeline se décompose en tâches Celery exécutées en séquence ou en parallèle. "
        "Chaque tâche consomme un nombre défini d'appels LLM avec des modèles de niveaux "
        "différents. La répartition distingue les tâches utilisant un modèle large "
        "(analyse complexe, génération de texte long) et les tâches utilisant un modèle "
        "léger (classification, extraction structurée, évaluation)."
    )

    add_h2(doc, "2.2. Décomposition par tâche (avec module offre technique)")

    add_table(doc,
        headers=["Tâche", "Modèle", "Appels min", "Appels max", "Tokens entrée (k)", "Tokens sortie (k)"],
        rows=[
            ["Analyse AO (CPS + RC)",     "Large", "1",  "1",  "25",  "2"],
            ["Matching équipe CVs",        "Large", "1",  "1",  "5",   "1"],
            ["Analyse CPS (offre tech.)", "Small", "1",  "1",  "20",  "2"],
            ["Analyse RC (offre tech.)",  "Small", "1",  "1",  "15",  "1"],
            ["Angle stratégique",          "Small", "1",  "1",  "5",   "1"],
            ["Contrôle qualité",           "Small", "1",  "3",  "10",  "1"],
            ["Génération de sections",     "Large", "6",  "18", "8/sect.", "3/sect."],
            ["Filler documents",           "Large", "3",  "3",  "5",   "3"],
            ["Récupération RAG (embed)",   "Embed", "6",  "6",  "0,5", "0"],
        ]
    )

    add_note(doc,
        "Le nombre maximal de 18 appels pour la génération de sections correspond au scénario où "
        "chaque section échoue au contrôle qualité et est régénérée deux fois. En pratique, "
        "ce cas est rare : le scénario nominal produit 6 appels."
    )

    add_h2(doc, "2.3. Le chatbot conversationnel")
    add_body(doc,
        "Chaque tour de conversation produit deux appels : un appel d'embedding pour "
        "la recherche dans la base Qdrant, et un appel au modèle de langage choisi par "
        "l'utilisateur. L'historique est tronqué à 10 messages pour limiter la taille "
        "du contexte. Une session type de 10 échanges consomme donc :"
    )
    add_table(doc,
        headers=["Composant", "Tokens entrée (k)", "Tokens sortie (k)", "Appels"],
        rows=[
            ["Embedding RAG (10 questions)", "5", "0", "10"],
            ["Appel LLM (contexte + historique)", "40", "20", "10"],
        ]
    )

    doc.add_page_break()

    # ─────────────────────────────────────────────────────────────────────────
    # 3. AVEC OFFRE TECHNIQUE
    # ─────────────────────────────────────────────────────────────────────────
    add_h1(doc, "3. Estimation des coûts avec le module offre technique")

    add_h2(doc, "3.1. Consommation par appel d'offres")
    add_body(doc,
        "Le coût minimal correspond à un pipeline sans regénération de sections : "
        "6 appels de génération. Le coût maximal correspond au scénario de regénération "
        "totale : 18 appels. Le tableau ci-dessous présente le coût complet d'un AO, "
        "chatbot exclu, pour chaque fournisseur."
    )

    rows_ao_full = []
    for label, li, lo, si, so, ei in SELECTED:
        cost_min = compute_cost_ao(PIPELINE_FULL, "min", li, lo, si, so, ei)
        cost_max = compute_cost_ao(PIPELINE_FULL, "max", li, lo, si, so, ei)
        rows_ao_full.append([label, f"${cost_min:.4f}", f"${cost_max:.4f}"])

    add_table(doc,
        headers=["Fournisseur", "Coût min / AO", "Coût max / AO"],
        rows=rows_ao_full
    )

    add_h2(doc, "3.2. Projection mensuelle (10 AOs + 20 sessions chat)")
    add_body(doc,
        "La projection mensuelle retient deux hypothèses : un client moyen traitant "
        "10 appels d'offres par mois, et 20 sessions chatbot de 10 messages chacune. "
        "Le chatbot utilise le même fournisseur que le pipeline. Les colonnes 'min' et "
        "'max' correspondent aux scénarios de régénération décrits plus haut."
    )

    rows_monthly_full = []
    for label, li, lo, si, so, ei in SELECTED:
        c_min = compute_cost_ao(PIPELINE_FULL, "min", li, lo, si, so, ei)
        c_max = compute_cost_ao(PIPELINE_FULL, "max", li, lo, si, so, ei)
        chat  = compute_chat_cost(li, lo, ei)
        total_min = 10 * c_min + 20 * chat
        total_max = 10 * c_max + 20 * chat
        rows_monthly_full.append([
            label,
            f"${c_min:.3f}",
            f"${c_max:.3f}",
            f"${chat:.3f}",
            f"${total_min:.2f}",
            f"${total_max:.2f}",
        ])

    add_table(doc,
        headers=["Fournisseur", "Coût/AO min", "Coût/AO max",
                 "Chat/session", "Total/mois min", "Total/mois max"],
        rows=rows_monthly_full
    )

    add_note(doc,
        "Ces projections n'incluent pas les coûts d'infrastructure (serveurs, base de données, "
        "stockage MinIO), estimés entre 30 et 80 dollars par mois pour un déploiement cloud modeste."
    )

    add_h2(doc, "3.3. Recommandations tarifaires (avec offre technique)")
    add_body(doc,
        "Les recommandations ci-dessous appliquent un coefficient multiplicateur de 8 à 12 "
        "sur le coût LLM direct, pour couvrir l'infrastructure, le support, la maintenance "
        "et la marge commerciale. Le fournisseur de référence retenu est Mistral, "
        "qui constitue la stack actuelle."
    )

    add_table(doc,
        headers=["Palier", "AOs inclus", "Sessions chat", "Coût LLM estimé", "Prix conseillé"],
        rows=[
            ["Starter",  "5 AOs/mois",   "10 sessions", "~$1,0/mois",  "$29/mois"],
            ["Pro",      "20 AOs/mois",  "50 sessions", "~$4,0/mois",  "$79/mois"],
            ["Agence",   "Illimité",     "Illimité",    "~$15/mois",   "$199/mois"],
        ]
    )
    add_body(doc,
        "Si l'opérateur retient un fournisseur premium comme Claude Sonnet ou GPT-5.4 "
        "pour le pipeline, les prix conseillés augmentent d'un facteur 5 à 8. Dans ce cas, "
        "le palier Starter atteindrait environ 49 dollars et le palier Pro environ 149 dollars."
    )

    doc.add_page_break()

    # ─────────────────────────────────────────────────────────────────────────
    # 4. SANS OFFRE TECHNIQUE
    # ─────────────────────────────────────────────────────────────────────────
    add_h1(doc, "4. Estimation des coûts sans le module offre technique")

    add_h2(doc, "4.1. Consommation par appel d'offres")
    add_body(doc,
        "Sans le module de génération de l'offre technique, le pipeline se réduit à "
        "trois tâches : l'analyse initiale du dossier AO, le matching de l'équipe, "
        "et le remplissage des documents administratifs. Le nombre d'appels LLM tombe "
        "à 5 appels fixes, sans variabilité liée aux regénérations."
    )

    rows_ao_no_ot = []
    for label, li, lo, si, so, ei in SELECTED:
        cost = compute_cost_ao(PIPELINE_NO_OT, "min", li, lo, si, so, ei)
        rows_ao_no_ot.append([label, f"${cost:.4f}"])

    add_table(doc,
        headers=["Fournisseur", "Coût / AO"],
        rows=rows_ao_no_ot
    )

    add_note(doc,
        "Sans offre technique, le coût est déterministe : un seul scénario, "
        "pas de regénération possible."
    )

    add_h2(doc, "4.2. Projection mensuelle (10 AOs + 20 sessions chat)")

    rows_monthly_no_ot = []
    for label, li, lo, si, so, ei in SELECTED:
        c     = compute_cost_ao(PIPELINE_NO_OT, "min", li, lo, si, so, ei)
        chat  = compute_chat_cost(li, lo, ei)
        total = 10 * c + 20 * chat
        rows_monthly_no_ot.append([
            label,
            f"${c:.4f}",
            f"${chat:.3f}",
            f"${total:.2f}",
        ])

    add_table(doc,
        headers=["Fournisseur", "Coût/AO", "Chat/session", "Total/mois"],
        rows=rows_monthly_no_ot
    )

    add_h2(doc, "4.3. Recommandations tarifaires (sans offre technique)")
    add_body(doc,
        "Sans la génération de l'offre technique, le coût LLM mensuel reste très faible, "
        "y compris avec des fournisseurs premium. Le principal levier de coût devient alors "
        "l'usage intensif du chatbot. La tarification peut être simplifiée."
    )

    add_table(doc,
        headers=["Palier", "AOs inclus", "Sessions chat", "Coût LLM estimé", "Prix conseillé"],
        rows=[
            ["Starter",  "10 AOs/mois",  "20 sessions", "~$1,5/mois",  "$19/mois"],
            ["Pro",      "50 AOs/mois",  "100 sessions", "~$8,0/mois", "$49/mois"],
            ["Agence",   "Illimité",     "Illimité",     "~$25/mois",  "$119/mois"],
        ]
    )

    doc.add_page_break()

    # ─────────────────────────────────────────────────────────────────────────
    # 5. SYNTHESE
    # ─────────────────────────────────────────────────────────────────────────
    add_h1(doc, "5. Synthèse et recommandation finale")

    add_h2(doc, "5.1. Comparaison des deux scénarios")
    add_body(doc,
        "Le module offre technique représente entre 50 et 80 % du coût LLM total d'un AO "
        "selon le taux de regénération. Il multiplie par 2 à 5 le coût du pipeline de base. "
        "Ce surcoût se justifie par la valeur produite : un document de 20 à 30 pages "
        "entièrement rédigé, structuré selon les exigences du dossier, en moins de 5 minutes."
    )

    add_table(doc,
        headers=["Scénario", "Coût Mistral / AO", "Coût Mistral / mois (10 AOs + chat)",
                 "Prix abo conseillé (Starter)"],
        rows=[
            ["Avec offre technique",  "$0,098 à $0,204", "$1,98 à $3,04", "$29/mois"],
            ["Sans offre technique",  "$0,041",           "$1,41",         "$19/mois"],
        ]
    )

    add_h2(doc, "5.2. Choix du fournisseur")
    add_body(doc,
        "Mistral reste le meilleur rapport qualité-coût pour les tâches de génération "
        "longue (sections offre technique) et pour le filler. DeepSeek V4-Flash constitue "
        "une alternative crédible à coût comparable, avec l'avantage d'un cache "
        "automatique. Les fournisseurs premium (Claude, GPT-5.4, Grok) multiplient les "
        "coûts par un facteur 5 à 30 sans apporter de gain mesurable sur la qualité des "
        "documents administratifs produits."
    )

    add_h2(doc, "5.3. Leviers d'optimisation")
    add_body(doc,
        "Trois actions permettent de réduire significativement les coûts sans dégrader "
        "la qualité des sorties. Premièrement, l'amélioration des prompts de génération "
        "de sections pour atteindre le contrôle qualité du premier coup réduit les appels "
        "LLM de 18 à 6, soit une économie de 60 %. Deuxièmement, l'activation du cache de "
        "prompts côté Mistral ou Anthropic diminue le coût des appels répétitifs de 50 à "
        "90 %. Troisièmement, la mise en place de quotas par palier d'abonnement protège "
        "la marge en cas d'usage intensif du chatbot."
    )

    add_body(doc,
        "Avec ces optimisations appliquées, le coût réel par AO avec offre technique "
        "converge vers 0,06 à 0,10 dollar. A ce niveau, un abonnement Starter à 29 dollars "
        "couvre confortablement 5 AOs et 10 sessions chat avec une marge brute supérieure "
        "à 85 %."
    )

    return doc


# ── Exécution ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    output = "/home/almukhadram/Desktop/offria/etude_financiere_llm_adjuja.docx"
    doc = build_document()
    doc.save(output)
    print(f"Document généré : {output}")
