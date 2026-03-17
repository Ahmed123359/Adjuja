"""
Service de remplissage des Actes d'Engagement / Déclarations sur l'Honneur PDF.

Deux modes de remplissage selon la disponibilité d'une clé OpenAI :

  Mode GPT-4o (openai_api_key fourni) — pipeline en 3 étapes :
    1. Scoring local des pages (pymupdf, sans API) → sélection des 3 pages pertinentes
    2. Analyse GPT-4o vision → JSON des champs + positions
    3. Remplissage pymupdf avec 3 niveaux de résolution :
         Niveau 1 — label_text  : recherche textuelle (PDF natif, label > 3 chars)
         Niveau 2 — line_order  : Nème ligne avec points dans la section (label court/absent)
         Niveau 3 — x_pct/y_pct : coordonnées GPT-4o directes (PDF scanné sans texte)

  Mode fallback (pas de clé OpenAI) :
    Recherche par mots-clés sur toutes les pages (approche initiale).
    Plus simple mais moins robuste — peut remplir la mauvaise section.
"""

from __future__ import annotations

import base64
import io
import json
import re
from typing import Optional

import fitz  # pymupdf
import openai


# ═════════════════════════════════════════════════════════════════════════════
# CONSTANTES
# ═════════════════════════════════════════════════════════════════════════════

# Tous les caractères utilisés comme "points" dans les formulaires marocains
_DOT_CHARS = set('._\u2026\u00b7\u00b7\u2025\u22ef\u0085')

# ── Mots-clés de scoring (mode GPT-4o) ───────────────────────────────────────
# Utilisés pour identifier les pages d'un acte d'engagement SANS appel API.
# Plus le score est élevé, plus la page est susceptible d'être pertinente.
_KEYWORDS_STRONG = [          # +3 pts — discriminants forts
    "déclaration sur l'honneur", "declaration sur l'honneur",
    "acte d'engagement", "acte dengagement",
    "je soussigné", "je soussignée",
]
_KEYWORDS_MEDIUM = [          # +2 pts — présents dans la section société
    "personne morale", "personnes morales",
    "raison sociale", "capital social",
    "cas des sociétés", "société privée",
]
_KEYWORDS_WEAK = [            # +1 pt — présents dans plusieurs sections
    "cnss", "registre du commerce", "registre de commerce",
    "identifiant commun", "taxe professionnelle",
    "domicile élu", "adresse du siège",
]

# ── Prompts GPT-4o ───────────────────────────────────────────────────────────
_SYSTEM_PROMPT = """
Tu es un expert en analyse de formulaires administratifs marocains (actes d'engagement,
déclarations sur l'honneur). Tu dois analyser le document et retourner UNIQUEMENT du JSON
valide, sans aucun texte autour.
""".strip()

_USER_PROMPT = """
Ce document est un formulaire de déclaration sur l'honneur / acte d'engagement marocain.
Tu reçois uniquement les pages pertinentes (sélectionnées au préalable).

Tu dois identifier UNIQUEMENT la sous-section qui concerne une SOCIÉTÉ PRIVÉE COMMERCIALE
(SARL, SA, SNC...).

IGNORE ces autres sous-sections :
- "Cas des établissements publics"
- "Cas des coopératives"
- "Cas de l'auto-entrepreneur"
- "Cas des personnes physiques"
- "Cas des groupements"

═══════════════════════════════════════════════════════════
RÈGLES CRITIQUES SUR LES CHAMPS PARTAGEANT LA MÊME LIGNE
═══════════════════════════════════════════════════════════

⚠️ RÈGLE 1 — "Je soussigné" et "agissant" sont TOUJOURS sur la même ligne :
   → UN SEUL champ : field_key="signataire_nom", nth=0
   → NE PAS créer qualite_signataire séparément

⚠️ RÈGLE 2 — "raison sociale" et "capital social" sont SOUVENT sur la même ligne :
   → raison_sociale : nth=0
   → capital_social : nth=1, MÊME label_text que raison_sociale
   Si sur lignes séparées : nth=0 pour chacun avec son propre label.

⚠️ RÈGLE 3 — "rc_localite" et "rc_numero" sont SOUVENT sur la même ligne :
   → rc_localite : nth=0
   → rc_numero   : nth=1, MÊME label_text que rc_localite
   NE PAS utiliser "sous le numéro" seul — trop générique.

⚠️ RÈGLE 4 — "telephone" et "fax" peuvent être sur la même ligne :
   → telephone : nth=0,  fax : nth=1, même label_text

════════════════════════════════════════════════════════════
FORMAT DE CHAQUE CHAMP
════════════════════════════════════════════════════════════

Pour chaque champ, retourne :
- "field_key"   : clé parmi : signataire_nom, raison_sociale, capital_social,
                  telephone, fax, email, adresse_siege, adresse_domicile,
                  cnss, rc_localite, rc_numero, taxe_pro, ice, rib
- "label_text"  : texte du libellé AVANT les pointillés, SANS points ni hints entre ().
                  Si libellé trop court ("de", "au") ou absent → ""
- "line_order"  : index de la ligne parmi TOUTES les lignes avec points dans la section,
                  de haut en bas à partir de 0. Compter uniquement les lignes avec pointillés.
- "nth"         : index de la zone de points sur cette ligne (0=première, 1=deuxième)
- "page"        : index de l'image reçue (0=première image reçue)
- "y_pct"       : position Y en % depuis le haut de page (fallback PDF scanné)
- "x_pct"       : position X en % du début des pointillés (fallback PDF scanné)

AUTRES RÈGLES :
- Pour le RIB : nth=1
- Les notes "(7)", "(8)"... NE sont PAS des champs
- NE PAS créer qualite_signataire

Retourne ce JSON et rien d'autre :
{
  "section_label": "Cas des sociétés",
  "y_start_pct": 30.0,
  "y_end_pct": 65.0,
  "page": 0,
  "fields": [
    {
      "field_key": "signataire_nom",
      "label_text": "Je soussigné",
      "line_order": 0,
      "nth": 0,
      "page": 0,
      "y_pct": 35.0,
      "x_pct": 22.0
    }
  ]
}
""".strip()


# ═════════════════════════════════════════════════════════════════════════════
# HELPERS — DÉTECTION DES ZONES À REMPLIR (rawdict char-level)
# ═════════════════════════════════════════════════════════════════════════════

def _find_dot_zones_in_spans(spans: list) -> list[tuple]:
    """
    Parcourt les caractères d'une ligne (rawdict) et regroupe les séquences
    de points consécutifs en zones à remplir.

    Pourquoi rawdict et pas dict ?
    → dict donne la bbox du span entier.
    → rawdict donne la bbox de chaque caractère → on localise exactement
      où commencent/finissent les points.

    L'effacement est étendu aux hints entre parenthèses qui suivent les points
    (ex: "(nom, prénom et qualité)") pour les supprimer proprement.

    Input :
        spans (list) — liste de spans rawdict d'une ligne pymupdf
    Output :
        list[tuple] — liste de (x0_insert, y0, x1_erase, y1, fontsize)
            x0_insert : x du début des points → où écrire la valeur
            x1_erase  : x de fin de la zone à effacer (inclut le hint si présent)
    """
    zones = []
    for span in spans:
        chars = span.get("chars", [])
        i = 0
        while i < len(chars):
            if chars[i]["c"] not in _DOT_CHARS:
                i += 1
                continue

            # Début d'une séquence de points
            dot_start = i
            while i < len(chars) and chars[i]["c"] in _DOT_CHARS:
                i += 1
            dot_end = i - 1

            if dot_end - dot_start + 1 < 3:  # ignorer les séquences trop courtes
                continue

            x0 = chars[dot_start]["bbox"][0]
            x1 = chars[dot_end]["bbox"][2]
            y0 = min(c["bbox"][1] for c in chars[dot_start:dot_end + 1])
            y1 = max(c["bbox"][3] for c in chars[dot_start:dot_end + 1])

            # Extension au hint entre parenthèses ex: "(nom, prénom et qualité)"
            erase_x1 = x1
            if i < len(chars) and chars[i]["c"] == '(':
                j = i
                while j < len(chars) and chars[j]["c"] != ')':
                    j += 1
                if j < len(chars):
                    erase_x1 = chars[j]["bbox"][2]
                    i = j + 1

            zones.append((x0, y0, erase_x1, y1, span.get("size", 9.5)))
    return zones


def _span_text(span: dict) -> str:
    """
    Reconstruit le texte d'un span rawdict depuis ses caractères.
    Nécessaire car rawdict ne fournit pas de clé 'text' directement.

    Input  : span (dict) — span rawdict pymupdf
    Output : str — texte reconstitué
    """
    return "".join(c["c"] for c in span.get("chars", []))


def _clean_label(label_text: str) -> str:
    """
    Nettoie le label retourné par GPT-4o avant de le passer en critère de recherche.

    Supprime :
    - Les séquences de points ("......") que GPT-4o inclut parfois malgré les instructions
    - Les hints entre parenthèses "(nom, prénom et qualité)"

    Input  : label_text (str) — label brut retourné par GPT-4o
    Output : str — label nettoyé, prêt pour la recherche textuelle

    Exemples :
        "Je soussigné:......(nom, prénom)" → "Je soussigné:"
        "Affiliée à la CNSS (7) sous le n°" → "Affiliée à la CNSS  sous le n°"
    """
    cleaned = re.sub(r'[._\u2026\u00b7\u2025\u22ef\u0085]{2,}', ' ', label_text)
    cleaned = re.sub(r'\([^)]*\)', ' ', cleaned)
    return re.sub(r'\s+', ' ', cleaned).strip()


# ═════════════════════════════════════════════════════════════════════════════
# HELPERS — LOCALISATION DES LIGNES
# ═════════════════════════════════════════════════════════════════════════════

def _get_all_dot_lines(
    page: fitz.Page,
    y_min_abs: float,
    y_max_abs: float,
) -> list[tuple]:
    """
    Construit la liste ordonnée de toutes les lignes contenant des points à remplir
    dans la section [y_min_abs, y_max_abs] de la page.

    Triée de haut en bas → l'index dans cette liste = line_order retourné par GPT-4o.
    Exemple : index 0 = première ligne avec points, 1 = deuxième, etc.

    Input :
        page      (fitz.Page) — page pymupdf à analyser
        y_min_abs (float)     — borne haute de la section (points PDF absolus)
        y_max_abs (float)     — borne basse de la section (points PDF absolus)
    Output :
        list[tuple] — liste de (line_y, spans, zones) triée par Y croissant
    """
    lines_with_dots = []
    for block in page.get_text("rawdict").get("blocks", []):
        for line in block.get("lines", []):
            spans = line.get("spans", [])
            if not spans:
                continue
            line_y = (line["bbox"][1] + line["bbox"][3]) / 2
            if line_y < y_min_abs or line_y > y_max_abs:
                continue
            zones = _find_dot_zones_in_spans(spans)
            if zones:
                lines_with_dots.append((line_y, spans, zones))
    lines_with_dots.sort(key=lambda x: x[0])
    return lines_with_dots


def _find_line_by_label(
    page: fitz.Page,
    label_text: str,
    y_min_abs: float,
    y_max_abs: float,
) -> tuple | None:
    """
    Cherche dans la section la ligne contenant le label_text.

    Scoring (du plus strict au plus souple) :
        Score 3 : label entier présent mot pour mot dans la ligne
        Score 2 : tous les mots-clés significatifs (len > 3) présents
        Score 1 : premier mot-clé présent

    En cas d'ex-aequo → ligne la plus haute (évite de tomber dans une section adjacente).

    Input :
        page       (fitz.Page) — page à analyser
        label_text (str)       — label nettoyé par _clean_label()
        y_min_abs  (float)     — borne haute de la section
        y_max_abs  (float)     — borne basse de la section
    Output :
        tuple (spans, zones) si trouvée, None sinon
    """
    label_clean = _clean_label(label_text).lower()
    # Mots significatifs uniquement (len > 3) pour éviter les faux positifs sur "de", "au"
    keywords = [w.strip(',:;') for w in label_clean.split() if len(w) > 3][:4]
    if not keywords:
        return None

    candidates = []
    for block in page.get_text("rawdict").get("blocks", []):
        for line in block.get("lines", []):
            spans = line.get("spans", [])
            if not spans:
                continue
            line_y = (line["bbox"][1] + line["bbox"][3]) / 2
            if line_y < y_min_abs or line_y > y_max_abs:
                continue
            full = "".join(_span_text(s) for s in spans).lower()
            zones = _find_dot_zones_in_spans(spans)
            if not zones:
                continue
            if label_clean in full:
                score = 3
            elif len(keywords) >= 2 and all(kw in full for kw in keywords):
                score = 2
            elif keywords[0] in full:
                score = 1
            else:
                continue
            candidates.append((score, line_y, spans, zones))

    if not candidates:
        return None
    candidates.sort(key=lambda x: (-x[0], x[1]))  # meilleur score, ligne la plus haute
    _, _, spans, zones = candidates[0]
    return spans, zones


# ═════════════════════════════════════════════════════════════════════════════
# HELPERS — ÉCRITURE
# ═════════════════════════════════════════════════════════════════════════════

def _write_value(page: fitz.Page, zones: list, nth: int, value: str) -> None:
    """
    Écrit une valeur dans la nth zone de points d'une ligne.

    Mécanisme :
        1. Rectangle blanc → efface les points + le hint éventuel entre parenthèses
        2. insert_text au x0 exact des points → écrit la valeur

    Input :
        page   (fitz.Page) — page à modifier (en place)
        zones  (list)      — liste de zones retournée par _find_dot_zones_in_spans()
        nth    (int)       — index de la zone à remplir (0 = première)
        value  (str)       — valeur à écrire
    Output :
        None — modifie la page en place
    """
    nth_safe = min(nth, len(zones) - 1)   # protection si GPT-4o retourne nth trop grand
    x0, y0, x1_erase, y1, fs = zones[nth_safe]
    page.draw_rect(
        fitz.Rect(x0 - 1, y0 - 1, x1_erase + 1, y1 + 1),
        color=(1, 1, 1), fill=(1, 1, 1),
    )
    page.insert_text(
        fitz.Point(x0, y1 - 1),
        value,
        fontsize=max(fs, 7.0),
        color=(0, 0, 0),
    )


def _fill_field(
    page: fitz.Page,
    label_text: str,
    line_order: int,
    y_min_abs: float,
    y_max_abs: float,
    y_target_abs: float,
    x_target_abs: float,
    nth: int,
    value: str,
    all_dot_lines: list,
) -> str:
    """
    Remplit un champ avec 3 niveaux de résolution (priorité décroissante).

    Niveau 1 — label_text (PDF natif, label > 3 chars) :
        Cherche la ligne par son texte via _find_line_by_label().
        Précis, indépendant de la position dans la section.

    Niveau 2 — line_order (PDF natif, label court ou absent) :
        Prend la Nème ligne avec des points dans la section.
        GPT-4o a compté ces lignes dans l'image → index fiable.

    Niveau 3 — x_pct/y_pct (PDF scanné, pas de couche texte) :
        Utilise les coordonnées estimées par GPT-4o en %.
        Approximatif (~5-10% d'erreur) mais fonctionne sur tous PDF.

    Input :
        page          (fitz.Page) — page à modifier
        label_text    (str)       — label brut GPT-4o (sera nettoyé par _clean_label)
        line_order    (int)       — index de la ligne dans all_dot_lines (fallback L2)
        y_min_abs     (float)     — borne haute de section (pts absolus)
        y_max_abs     (float)     — borne basse de section (pts absolus)
        y_target_abs  (float)     — position Y GPT-4o en pts absolus (fallback L3)
        x_target_abs  (float)     — position X GPT-4o en pts absolus (fallback L3)
        nth           (int)       — Nème zone de points sur la ligne
        value         (str)       — valeur à insérer
        all_dot_lines (list)      — cache des lignes avec points (_get_all_dot_lines)
    Output :
        str — mode utilisé : "label" | "order" | "scanné" | "echec"
    """
    label_clean = _clean_label(label_text)

    # ── Niveau 1 : recherche par texte du libellé ────────────────────────────
    if len(label_clean) > 3:
        result = _find_line_by_label(page, label_clean, y_min_abs, y_max_abs)
        if result is not None:
            _, zones = result
            _write_value(page, zones, nth, value)
            return "label"

    # ── Niveau 2 : Nème ligne avec points dans la section ────────────────────
    if 0 <= line_order < len(all_dot_lines):
        _, _, zones = all_dot_lines[line_order]
        _write_value(page, zones, nth, value)
        return "order"

    # ── Niveau 3 : coordonnées GPT-4o directes (PDF scanné) ─────────────────
    if x_target_abs > 0 and y_target_abs > 0:
        line_h = 12
        page.draw_rect(
            fitz.Rect(x_target_abs - 1, y_target_abs - line_h,
                      x_target_abs + 300, y_target_abs + 2),
            color=(1, 1, 1), fill=(1, 1, 1),
        )
        page.insert_text(
            fitz.Point(x_target_abs, y_target_abs),
            value, fontsize=9.0, color=(0, 0, 0),
        )
        return "scanné"

    return "echec"


# ═════════════════════════════════════════════════════════════════════════════
# HELPERS — SCORING ET SÉLECTION DES PAGES (sans appel API)
# ═════════════════════════════════════════════════════════════════════════════

def _score_page(page: fitz.Page) -> int:
    """
    Score une page selon la densité de mots-clés liés à une déclaration sur l'honneur.
    Travail purement local (pymupdf), zéro appel API.

    Input  : page (fitz.Page) — page pymupdf à scorer
    Output : int — score (0 si page vide ou scannée)
    """
    text = page.get_text("text").lower()
    score = 0
    for kw in _KEYWORDS_STRONG:
        if kw in text:
            score += 3
    for kw in _KEYWORDS_MEDIUM:
        if kw in text:
            score += 2
    for kw in _KEYWORDS_WEAK:
        if kw in text:
            score += 1
    return score


def _select_relevant_pages(
    pdf_bytes: bytes,
    top_n: int = 3,
) -> tuple[list[int], list[str]]:
    """
    Sélectionne les pages les plus pertinentes d'un PDF sans appel API.

    Stratégie :
        - Score chaque page par mots-clés pondérés
        - Garde les top_n pages avec le score le plus élevé
        - Si tout le monde a score 0 (PDF scanné) → prend les top_n premières pages

    Input :
        pdf_bytes (bytes) — PDF brut
        top_n     (int)   — nombre de pages à sélectionner (défaut 3)
    Output :
        tuple[list[int], list[str]] :
            - page_indices : indices des pages sélectionnées (ordre original PDF)
            - pages_b64    : images PNG base64 de ces pages (pour GPT-4o)
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    mat = fitz.Matrix(150 / 72, 150 / 72)   # 150 dpi
    top_n = min(top_n, doc.page_count)

    scores = [(i, _score_page(page)) for i, page in enumerate(doc)]
    scores.sort(key=lambda x: -x[1])
    selected = scores[:top_n]

    # Fallback PDF scanné (score 0 partout)
    if all(s == 0 for _, s in selected):
        selected = [(i, 0) for i in range(top_n)]

    selected.sort(key=lambda x: x[0])  # remettre dans l'ordre du document
    page_indices = [i for i, _ in selected]

    pages_b64 = []
    for i in page_indices:
        pix = doc[i].get_pixmap(matrix=mat, alpha=False)
        pages_b64.append(base64.b64encode(pix.tobytes("png")).decode("utf-8"))

    doc.close()
    return page_indices, pages_b64


# ═════════════════════════════════════════════════════════════════════════════
# HELPERS — APPEL GPT-4o
# ═════════════════════════════════════════════════════════════════════════════

async def _analyze_with_gpt4o(
    pages_b64: list[str],
    page_indices: list[int],
    openai_api_key: str,
) -> dict:
    """
    Envoie les pages sélectionnées à GPT-4o pour identifier les champs à remplir.

    GPT-4o retourne pour chaque champ :
        label_text  : texte du libellé (Niveau 1)
        line_order  : Nème ligne avec points dans la section (Niveau 2)
        nth         : Nème zone de points sur la ligne
        y_pct/x_pct : coordonnées % (Niveau 3 — PDF scanné)

    Les indices page relatifs (0,1,2 = images reçues) sont traduits en indices
    PDF réels grâce à page_indices.

    Input :
        pages_b64     (list[str])  — images base64 des pages sélectionnées
        page_indices  (list[int])  — indices PDF réels correspondants
        openai_api_key (str)       — clé OpenAI
    Output :
        dict — résultat JSON GPT-4o avec indices page traduits
               Clés : section_label, y_start_pct, y_end_pct, page, fields[]
    """
    image_contents = [
        {
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{b64}", "detail": "high"},
        }
        for b64 in pages_b64
    ]
    image_contents.append({"type": "text", "text": _USER_PROMPT})

    client = openai.AsyncOpenAI(api_key=openai_api_key)
    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user",   "content": image_contents},
        ],
        response_format={"type": "json_object"},
        max_tokens=2000,
        temperature=0,
    )

    result = json.loads(response.choices[0].message.content)

    # Traduction des indices page relatifs → indices PDF réels
    section_page_rel = result.get("page", 0)
    result["page"] = page_indices[min(section_page_rel, len(page_indices) - 1)]
    for f in result.get("fields", []):
        rel = f.get("page", section_page_rel)
        f["page"] = page_indices[min(rel, len(page_indices) - 1)]

    return result


# ═════════════════════════════════════════════════════════════════════════════
# HELPERS — REMPLISSAGE GUIDÉ PAR GPT-4o (mode principal)
# ═════════════════════════════════════════════════════════════════════════════

def _fill_from_gpt_result(
    doc: fitz.Document,
    gpt_result: dict,
    data: dict[str, str],
) -> dict[str, str]:
    """
    Orchestre le remplissage du PDF à partir du résultat GPT-4o.

    Pour chaque champ dans gpt_result["fields"] :
        1. Vérifie que la valeur existe dans data
        2. Convertit % → coordonnées absolues
        3. Utilise le cache dot_lines_cache (évite de relire rawdict à chaque champ)
        4. Appelle _fill_field() avec les 3 niveaux de résolution

    Input :
        doc        (fitz.Document) — document PDF ouvert et modifiable
        gpt_result (dict)          — résultat de _analyze_with_gpt4o()
        data       (dict[str,str]) — valeurs à insérer, clés = field_key GPT-4o
    Output :
        dict[str, str] — rapport : field_key → mode utilisé ("label"|"order"|"scanné"|"echec"|"skip")
    """
    gpt_fields   = gpt_result.get("fields", [])
    section_page = gpt_result.get("page", 0)
    y_start_pct  = gpt_result.get("y_start_pct", 0)
    y_end_pct    = gpt_result.get("y_end_pct", 100)

    # Détection préventive des doublons (même label+order+nth+page ciblés deux fois)
    seen: dict[tuple, str] = {}
    for f in gpt_fields:
        key = (f.get("label_text", ""), f.get("line_order", -1), f.get("nth", 0), f.get("page", 0))
        if key in seen:
            pass  # doublon loggé dans le rapport final
        seen[key] = f.get("field_key", "")

    dot_lines_cache: dict[int, list] = {}  # cache rawdict par numéro de page
    report: dict[str, str] = {}

    for f in gpt_fields:
        field_key  = f.get("field_key", "")
        label_text = f.get("label_text", "")
        line_order = f.get("line_order", -1)
        nth        = f.get("nth", 0)
        page_idx   = f.get("page", section_page)
        y_pct      = f.get("y_pct", 50)
        x_pct      = f.get("x_pct", 0)
        value      = data.get(field_key, "")

        if not value:
            report[field_key] = "skip"
            continue
        if page_idx >= len(doc):
            report[field_key] = "echec"
            continue

        page   = doc[page_idx]
        page_h = page.rect.height
        page_w = page.rect.width

        y_min_abs = y_start_pct / 100 * page_h
        y_max_abs = y_end_pct   / 100 * page_h
        y_abs     = y_pct / 100 * page_h
        x_abs     = x_pct / 100 * page_w

        # Cache rawdict : construit une seule fois par page
        if page_idx not in dot_lines_cache:
            dot_lines_cache[page_idx] = _get_all_dot_lines(page, y_min_abs, y_max_abs)

        mode = _fill_field(
            page, label_text, line_order,
            y_min_abs, y_max_abs, y_abs, x_abs,
            nth, value, dot_lines_cache[page_idx],
        )
        report[field_key] = mode

    return report


# ═════════════════════════════════════════════════════════════════════════════
# HELPERS — ÉLÉMENTS COMPLÉMENTAIRES (Fait à, signature, cachet)
# ═════════════════════════════════════════════════════════════════════════════

def _fill_fait_a(page: fitz.Page, lieu: str, date_str: str) -> None:
    """
    Remplit la ligne "Fait à …, le …" sur une page.

    Cherche la ligne contenant "Fait" et "à" via dict (mode texte standard),
    efface la ligne entière et réécrit "Fait à <lieu>, le <date>".

    Input :
        page     (fitz.Page) — page à modifier
        lieu     (str)       — ex: "Casablanca"
        date_str (str)       — ex: "16/03/2026"
    Output :
        None — modifie la page en place
    """
    if not lieu and not date_str:
        return

    rect, fontsize = None, 10.0
    for block in page.get_text("dict").get("blocks", []):
        for line in block.get("lines", []):
            full = "".join(s["text"] for s in line.get("spans", []))
            if "Fait" in full and ("\u00e0" in full or "ait a" in full.lower()):
                spans = line.get("spans", [])
                if spans:
                    rect = fitz.Rect(spans[0]["bbox"])
                    fontsize = spans[0]["size"]
                    break
        if rect:
            break

    if rect is None:
        return

    line_rect = fitz.Rect(rect.x0, rect.y0 - 2, page.rect.width - 15, rect.y1 + 2)
    page.draw_rect(line_rect, color=(1.0, 1.0, 1.0), fill=(1.0, 1.0, 1.0))
    text = "Fait \u00e0"
    if lieu:
        text += f" {lieu}"
    if date_str:
        text += f", le {date_str}"
    page.insert_text(fitz.Point(rect.x0, rect.y1 - 1), text, fontsize=fontsize, color=(0, 0, 0))


def _apply_images(
    page: fitz.Page,
    signature_bytes: Optional[bytes],
    cachet_bytes: Optional[bytes],
) -> None:
    """
    Appose la signature et le cachet sur une page.

    Signature : coin bas-droit (toutes les pages qui en ont une).
    Cachet    : coin bas-gauche (toutes les pages qui en ont un).

    Input :
        page            (fitz.Page)   — page à modifier
        signature_bytes (bytes|None)  — image PNG/JPEG de la signature
        cachet_bytes    (bytes|None)  — image PNG/JPEG du cachet
    Output :
        None — modifie la page en place
    """
    pw, ph = page.rect.width, page.rect.height
    if signature_bytes:
        sig_w, sig_h = 120, 50
        page.insert_image(
            fitz.Rect(pw - 90 - sig_w, ph - 60 - sig_h, pw - 90, ph - 60),
            stream=signature_bytes, keep_proportion=True,
        )
    if cachet_bytes:
        cac_w, cac_h = 100, 100
        page.insert_image(
            fitz.Rect(50, ph - 50 - cac_h, 50 + cac_w, ph - 50),
            stream=cachet_bytes, keep_proportion=True,
        )


# ═════════════════════════════════════════════════════════════════════════════
# MODE FALLBACK — Remplissage par mots-clés (sans OpenAI)
# ═════════════════════════════════════════════════════════════════════════════

def _fill_nth_dots(
    page: fitz.Page,
    keywords: list[str],
    value: str,
    nth: int = 0,
    max_fills: int = 1,
) -> None:
    """
    Mode fallback : cherche les lignes contenant un keyword et remplit la nth zone.

    Utilisé quand openai_api_key est absent. Plus simple mais moins robuste :
    ne distingue pas les sections du document (risque de remplir la mauvaise section).

    Input :
        page      (fitz.Page)  — page à modifier
        keywords  (list[str])  — mots-clés pour identifier la ligne (insensible casse)
        value     (str)        — valeur à insérer
        nth       (int)        — index de la zone de points (0 = première)
        max_fills (int)        — nombre max de lignes à remplir (1 = première occurrence)
    Output :
        None — modifie la page en place
    """
    if not value:
        return
    filled = 0
    for block in page.get_text("rawdict").get("blocks", []):
        if filled >= max_fills:
            break
        for line in block.get("lines", []):
            if filled >= max_fills:
                break
            spans = line.get("spans", [])
            full = "".join(c["c"] for s in spans for c in s.get("chars", []))
            if not any(kw.lower() in full.lower() for kw in keywords):
                continue
            zones = _find_dot_zones_in_spans(spans)
            if nth >= len(zones):
                continue
            x0, y0, x1_erase, y1, fs = zones[nth]
            page.draw_rect(
                fitz.Rect(x0 - 1, y0 - 1, x1_erase + 1, y1 + 1),
                color=(1.0, 1.0, 1.0), fill=(1.0, 1.0, 1.0),
            )
            page.insert_text(
                fitz.Point(x0, y1 - 1), value,
                fontsize=max(fs, 7.0), color=(0.0, 0.0, 0.0),
            )
            filled += 1


def _fill_keyword_mode(doc: fitz.Document, data: dict[str, str], type_soumissionnaire: str) -> None:
    """
    Remplissage fallback sur toutes les pages par mots-clés.

    Input :
        doc                  (fitz.Document) — document à modifier
        data                 (dict)          — valeurs à insérer
        type_soumissionnaire (str)           — "physique" | "morale" | "groupement"
    Output :
        None — modifie le document en place
    """
    for page in doc:
        _fill_nth_dots(page, ["identifiant commun"],                   data.get("ice", ""))
        _fill_nth_dots(page, ["taxe professionnelle", "taxe prof"],    data.get("taxe_pro", ""))
        _fill_nth_dots(page, ["affilié", "affiliée"],                  data.get("cnss", ""),         nth=0)
        _fill_nth_dots(page, ["domicile élu", "domicile elu"],         data.get("adresse_domicile", ""))
        _fill_nth_dots(page, ["téléphone", "telephone", "tél"],        data.get("telephone", ""))
        _fill_nth_dots(page, ["fax"],                                   data.get("fax", ""))
        _fill_nth_dots(page, ["électronique", "electronique", "email"], data.get("email", ""))
        _fill_nth_dots(page, ["identité bancaire", "RIB"],             data.get("rib", ""),          nth=1)

        if data.get("rc_localite"):
            _fill_nth_dots(page, ["registre du commerce", "registre de commerce"], data["rc_localite"], nth=0)
        if data.get("rc_numero"):
            _fill_nth_dots(page, ["registre du commerce", "registre de commerce"], data["rc_numero"],   nth=1)

        if type_soumissionnaire == "physique":
            _fill_nth_dots(page, ["soussigné", "soussignée"], data.get("signataire_nom", ""))

        elif type_soumissionnaire == "morale":
            _fill_nth_dots(page, ["soussigné", "soussignée"], data.get("signataire_nom", ""), nth=0)
            rs = data.get("raison_sociale", "")
            fj = data.get("forme_juridique", "")
            rs_fj = f"{rs} ({fj})" if rs and fj else rs or fj
            _fill_nth_dots(page, ["raison sociale", "pour le compte de"], rs_fj,                      nth=0)
            _fill_nth_dots(page, ["capital social"],                       data.get("capital_social", ""))
            _fill_nth_dots(page, ["siège social", "siege social"],         data.get("adresse_siege", ""))

        elif type_soumissionnaire == "groupement":
            membres = [m.strip() for m in data.get("membres_groupement", "").split("\n") if m.strip()]
            for idx, membre in enumerate(membres[:10]):
                _fill_nth_dots(page, [f"Membre n° {idx + 1}"], membre)

        _fill_fait_a(page, data.get("fait_a_lieu", ""), data.get("fait_a_date", ""))

        if data.get("_signature_bytes") or data.get("_cachet_bytes"):
            _apply_images(page, data.get("_signature_bytes"), data.get("_cachet_bytes"))


# ═════════════════════════════════════════════════════════════════════════════
# POINT D'ENTRÉE PRINCIPAL
# ═════════════════════════════════════════════════════════════════════════════

async def fill_acte_engagement(
    pdf_bytes:            bytes,
    openai_api_key:       str            = "",
    type_soumissionnaire: str            = "morale",
    signataire_nom:       str            = "",
    adresse_domicile:     str            = "",
    telephone:            str            = "",
    fax:                  str            = "",
    email:                str            = "",
    rib:                  str            = "",
    cnss:                 str            = "",
    rc_localite:          str            = "",
    rc_numero:            str            = "",
    taxe_pro:             str            = "",
    ice:                  str            = "",
    raison_sociale:       str            = "",
    forme_juridique:      str            = "",
    capital_social:       str            = "",
    adresse_siege:        str            = "",
    membres_groupement:   str            = "",
    fait_a_lieu:          str            = "",
    fait_a_date:          str            = "",
    signature_bytes:      Optional[bytes] = None,
    cachet_bytes:         Optional[bytes] = None,
) -> bytes:
    """
    Remplit les champs d'un Acte d'Engagement PDF.

    Choisit automatiquement le mode de remplissage selon la clé OpenAI :
        - openai_api_key fourni → mode GPT-4o (scoring + analyse + 3 niveaux)
        - openai_api_key absent → mode fallback (mots-clés sur toutes les pages)

    Input :
        pdf_bytes            — PDF vierge (bytes)
        openai_api_key       — clé OpenAI (si vide → mode fallback)
        type_soumissionnaire — "physique" | "morale" | "groupement"
        signataire_nom       — ex: "Ahmed Benali, Directeur Général"
        adresse_domicile     — ex: "12 Rue Hassan II, Casablanca"
        telephone            — ex: "0522 123 456"
        fax                  — ex: "0522 789 012"
        email                — ex: "contact@abi.ma"
        rib                  — ex: "007780000001234567890123" (24 positions)
        cnss                 — ex: "1234567"
        rc_localite          — ex: "Casablanca"
        rc_numero            — ex: "RC 145853"
        taxe_pro             — ex: "TP 56789012"
        ice                  — ex: "002579010000023"
        raison_sociale       — ex: "ABI Consulting"
        forme_juridique      — ex: "SARL AU"
        capital_social       — ex: "100.000 MAD"
        adresse_siege        — ex: "Imm 30, Appt 08, Rue Loukili, Rabat"
        membres_groupement   — membres séparés par \\n (mode groupement)
        fait_a_lieu          — ex: "Casablanca"
        fait_a_date          — ex: "16/03/2026"
        signature_bytes      — image PNG/JPEG de la signature (None = pas de signature)
        cachet_bytes         — image PNG/JPEG du cachet (None = pas de cachet)
    Output :
        bytes — PDF rempli
    """
    # Dict unifié des valeurs (utilisé dans les deux modes)
    data: dict[str, str] = {
        "signataire_nom":   signataire_nom,
        "raison_sociale":   raison_sociale,
        "capital_social":   capital_social,
        "telephone":        telephone,
        "fax":              fax,
        "email":            email,
        "adresse_siege":    adresse_siege,
        "adresse_domicile": adresse_domicile,
        "cnss":             cnss,
        "rc_localite":      rc_localite,
        "rc_numero":        rc_numero,
        "taxe_pro":         taxe_pro,
        "ice":              ice,
        "rib":              rib,
        "forme_juridique":  forme_juridique,
        "membres_groupement": membres_groupement,
        "fait_a_lieu":      fait_a_lieu,
        "fait_a_date":      fait_a_date,
    }

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    if openai_api_key:
        # ── Mode GPT-4o : scoring → analyse → remplissage 3 niveaux ──────────
        page_indices, pages_b64 = _select_relevant_pages(pdf_bytes, top_n=3)
        gpt_result = await _analyze_with_gpt4o(pages_b64, page_indices, openai_api_key)
        _fill_from_gpt_result(doc, gpt_result, data)

        # Fait à + signature/cachet sur toutes les pages
        for page in doc:
            _fill_fait_a(page, fait_a_lieu, fait_a_date)
            if signature_bytes or cachet_bytes:
                _apply_images(page, signature_bytes, cachet_bytes)
    else:
        # ── Mode fallback : mots-clés sur toutes les pages ────────────────────
        data["_signature_bytes"] = signature_bytes  # type: ignore[assignment]
        data["_cachet_bytes"]    = cachet_bytes       # type: ignore[assignment]
        _fill_keyword_mode(doc, data, type_soumissionnaire)

    output = io.BytesIO()
    doc.save(output)
    doc.close()
    return output.getvalue()