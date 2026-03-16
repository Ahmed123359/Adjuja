import io
from typing import Optional
import fitz  # pymupdf


# ─────────────────────────────────────────────────────────────────────────────
# Détection des zones à remplir au niveau caractère (rawdict)
# ─────────────────────────────────────────────────────────────────────────────

_DOT_CHARS = set('._…\u2026\u00b7·\u2025\u22ef\u0085')


def _find_dot_zones(spans: list) -> list[tuple]:
    """
    Trouve toutes les séquences de points consécutifs dans une ligne (rawdict).

    Utilise les bboxes caractère par caractère pour une précision maximale.
    Gère les spans mixtes comme "soussigné.......(nom, prénom et qualité)" :
    - x0_insert = début exact des points (position d'insertion du texte)
    - x1_erase  = fin de la zone à effacer, étendue au texte entre parenthèses
                  qui suit immédiatement les points (hint text à supprimer)

    Exemple :
      "registre du commerce de.........(localité) sous le numéro"
      → x0_insert = début des "."
      → x1_erase  = fin de ")" pour effacer "(localité)" aussi

    Input  : spans — liste de spans rawdict
    Output : liste de tuples (x0_insert, y0, x1_erase, y1, fontsize)
    """
    zones = []
    for span in spans:
        chars = span.get("chars", [])
        i = 0
        while i < len(chars):
            if chars[i]["c"] not in _DOT_CHARS:
                i += 1
                continue

            # Collecter tous les points consécutifs
            dot_start = i
            while i < len(chars) and chars[i]["c"] in _DOT_CHARS:
                i += 1
            dot_end = i - 1

            if dot_end - dot_start + 1 < 3:
                continue

            x0 = chars[dot_start]["bbox"][0]
            x1 = chars[dot_end]["bbox"][2]
            y0 = min(c["bbox"][1] for c in chars[dot_start:dot_end + 1])
            y1 = max(c["bbox"][3] for c in chars[dot_start:dot_end + 1])

            # Étendre l'effacement au texte entre parenthèses qui suit les points
            # ex: "(nom, prénom et qualité)" ou "(localité)"
            erase_x1 = x1
            if i < len(chars) and chars[i]["c"] == '(':
                j = i
                while j < len(chars) and chars[j]["c"] != ')':
                    j += 1
                if j < len(chars):  # parenthèse fermante trouvée
                    erase_x1 = chars[j]["bbox"][2]
                    i = j + 1

            zones.append((x0, y0, erase_x1, y1, span.get("size", 9.5)))

    return zones


def _fill_nth_dots(
    page: fitz.Page,
    keywords: list[str],
    value: str,
    nth: int = 0,
    max_fills: int = 1,
) -> None:
    """
    Trouve les lignes contenant un keyword, remplace la nth zone de points par value.

    Utilise rawdict + _find_dot_zones pour :
    - positionner l'insertion à x0 exact des points
    - effacer jusqu'à x1_erase (qui inclut le hint entre parenthèses si présent)
    - limiter le remplissage à max_fills occurrences (évite double-remplissage
      quand le même label apparaît dans plusieurs sections du document)

    Input  : page      — fitz.Page à modifier
             keywords  — mots-clés pour identifier la ligne (insensible à la casse)
             value     — valeur à insérer
             nth       — index de la zone de points (0 = première)
             max_fills — nombre max de lignes à remplir
    Output : None — modifie la page en place
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

            zones = _find_dot_zones(spans)
            if nth >= len(zones):
                continue

            x0, y0, x1_erase, y1, fs = zones[nth]
            # Effacer la zone de points + hint entre parenthèses
            page.draw_rect(
                fitz.Rect(x0 - 1, y0 - 1, x1_erase + 1, y1 + 1),
                color=(1.0, 1.0, 1.0), fill=(1.0, 1.0, 1.0),
            )
            # Insérer la valeur à partir du x0 exact des points
            page.insert_text(
                fitz.Point(x0, y1 - 1),
                value,
                fontsize=max(fs, 7.0),
                color=(0.0, 0.0, 0.0),
            )
            filled += 1


# ─────────────────────────────────────────────────────────────────────────────
# Remplissage de la ligne "Fait à …, le …"
# ─────────────────────────────────────────────────────────────────────────────

def _find_fait_a_span(page: fitz.Page) -> tuple[fitz.Rect | None, float]:
    for block in page.get_text("dict").get("blocks", []):
        for line in block.get("lines", []):
            full = "".join(s["text"] for s in line.get("spans", []))
            if "Fait" in full and ("\u00e0" in full or "ait a" in full.lower()):
                spans = line.get("spans", [])
                if spans:
                    return fitz.Rect(spans[0]["bbox"]), spans[0]["size"]
    return None, 10.0


def _fill_fait_a(page: fitz.Page, lieu: str, date_str: str) -> None:
    if not lieu and not date_str:
        return
    rect, fontsize = _find_fait_a_span(page)
    if rect is None:
        return
    line_rect = fitz.Rect(rect.x0, rect.y0 - 2, page.rect.width - 15, rect.y1 + 2)
    page.draw_rect(line_rect, color=(1.0, 1.0, 1.0), fill=(1.0, 1.0, 1.0))
    text = "Fait \u00e0"
    if lieu:
        text += f" {lieu}"
    if date_str:
        text += f", le {date_str}"
    page.insert_text(
        fitz.Point(rect.x0, rect.y1 - 1),
        text,
        fontsize=fontsize,
        color=(0.0, 0.0, 0.0),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Fonction principale
# ─────────────────────────────────────────────────────────────────────────────

def fill_acte_engagement(
    pdf_bytes: bytes,
    type_soumissionnaire: str = "morale",   # "physique" | "morale" | "groupement"
    signataire_nom: str = "",               # prénom, nom et qualité du signataire
    adresse_domicile: str = "",             # adresse du domicile élu
    telephone: str = "",                    # numéro de téléphone
    fax: str = "",                          # numéro de fax
    email: str = "",                        # adresse électronique
    rib: str = "",                          # relevé d'identité bancaire (24 positions)
    cnss: str = "",                         # numéro d'affiliation CNSS
    rc_localite: str = "",                  # localité du registre du commerce
    rc_numero: str = "",                    # numéro du registre du commerce
    taxe_pro: str = "",                     # numéro taxe professionnelle
    ice: str = "",                          # identifiant commun de l'entreprise
    raison_sociale: str = "",               # raison sociale (personne morale)
    forme_juridique: str = "",              # forme juridique (personne morale)
    capital_social: str = "",               # capital social (personne morale)
    adresse_siege: str = "",                # adresse du siège social
    membres_groupement: str = "",           # membres du groupement (1 par ligne)
    fait_a_lieu: str = "",
    fait_a_date: str = "",
    signature_bytes: Optional[bytes] = None,
    cachet_bytes: Optional[bytes] = None,
) -> bytes:
    """
    Remplit les champs d'un Acte d'Engagement / Déclaration sur l'Honneur PDF.

    Stratégie :
    - rawdict pour détecter les zones de points au niveau caractère
    - Effacement étendu aux hints entre parenthèses suivant les points
    - max_fills=1 pour éviter le double-remplissage (plusieurs sections par doc)

    Input  :
        pdf_bytes           — PDF brut vierge
        type_soumissionnaire — "physique" | "morale" | "groupement"
        signataire_nom      — ex: "Ahmed Benali, Directeur Général"
        adresse_domicile    — ex: "12 rue Hassan II, Casablanca"
        telephone           — ex: "0522 123 456"
        fax                 — ex: "0522 789 012"
        email               — ex: "contact@abi.ma"
        rib                 — ex: "007 780 0000012345678901 23" (24 positions)
        cnss                — ex: "1234567"
        rc_localite         — ex: "Casablanca"
        rc_numero           — ex: "RC 145853"
        taxe_pro            — ex: "TP 56789012"
        ice                 — ex: "002579010000023"
        raison_sociale      — ex: "ABI Consulting"
        forme_juridique     — ex: "SARL AU"
        capital_social      — ex: "100.000 MAD"
        adresse_siege       — ex: "Imm 30, Appt 08, Rue Loukili, Rabat"
        membres_groupement  — noms séparés par \\n
        fait_a_lieu         — ex: "Casablanca"
        fait_a_date         — ex: "16/03/2026"
        signature_bytes     — image PNG/JPEG (None = pas de signature)
        cachet_bytes        — image PNG/JPEG (None = pas de cachet)

    Output : bytes — PDF rempli
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    for page in doc:

        # ── Champs communs (tous types) ───────────────────────────────────
        _fill_nth_dots(page, ["identifiant commun"], ice)
        _fill_nth_dots(page, ["taxe professionnelle", "taxe prof"], taxe_pro)
        _fill_nth_dots(page, ["affilié", "affiliée"], cnss, nth=0)
        _fill_nth_dots(page, ["domicile élu", "domicile elu"], adresse_domicile)
        _fill_nth_dots(page, ["téléphone", "telephone", "tél"], telephone)
        _fill_nth_dots(page, ["fax"], fax)
        _fill_nth_dots(page, ["électronique", "electronique", "e-mail", "email"], email)
        _fill_nth_dots(page, ["identité bancaire", "identite bancaire", "RIB"], rib, nth=1)

        # RC — localité (zone 0) et numéro (zone 1) sur la même ligne
        if rc_localite:
            _fill_nth_dots(page, ["registre du commerce", "registre de commerce"], rc_localite, nth=0)
        if rc_numero:
            _fill_nth_dots(page, ["registre du commerce", "registre de commerce"], rc_numero, nth=1)

        # ── Personne physique ─────────────────────────────────────────────
        if type_soumissionnaire == "physique":
            _fill_nth_dots(page, ["soussigné", "soussignée"], signataire_nom)

        # ── Personne morale ───────────────────────────────────────────────
        elif type_soumissionnaire == "morale":
            _fill_nth_dots(page, ["soussigné", "soussignée"], signataire_nom, nth=0)
            rs_fj = f"{raison_sociale} ({forme_juridique})" if raison_sociale and forme_juridique \
                else raison_sociale or forme_juridique
            _fill_nth_dots(page, ["raison sociale", "pour le compte de"], rs_fj, nth=0)
            _fill_nth_dots(page, ["capital social"], capital_social)
            _fill_nth_dots(page, ["siège social", "siege social"], adresse_siege)

        # ── Groupement ────────────────────────────────────────────────────
        elif type_soumissionnaire == "groupement":
            membres = [m.strip() for m in membres_groupement.split("\n") if m.strip()]
            for idx, membre in enumerate(membres[:10]):
                _fill_nth_dots(
                    page,
                    [f"Membre n° {idx + 1}", f"Membre  n°  {idx + 1}", f"– Membre  n°  {idx + 1}"],
                    membre,
                )

        # ── Fait à …, le … ────────────────────────────────────────────────
        _fill_fait_a(page, fait_a_lieu, fait_a_date)

        # ── Signature et cachet ───────────────────────────────────────────
        if signature_bytes or cachet_bytes:
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

    output = io.BytesIO()
    doc.save(output)
    doc.close()
    return output.getvalue()