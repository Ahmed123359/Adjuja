import io
from typing import Optional
import fitz  # pymupdf


# ──────────────────────────────────────────────────────────────────────────────
# Tampons par défaut (générés dynamiquement si aucun fichier n'est fourni)
# ──────────────────────────────────────────────────────────────────────────────

def _make_default_signature() -> bytes:
    """
    Génère une image de signature par défaut : rectangle violet avec le texte
    "Signé électroniquement".

    Input  : aucun
    Output : bytes — image PNG (200×58 px)
    """
    doc = fitz.open()
    page = doc.new_page(width=200, height=58)
    page.draw_rect(fitz.Rect(3, 3, 197, 55), color=(0.42, 0.2, 0.75), width=1.5)
    page.insert_text(fitz.Point(10, 37), "Signé électroniquement", fontsize=11, color=(0.42, 0.2, 0.75))
    pix = page.get_pixmap(alpha=False)
    data = pix.tobytes("png")
    doc.close()
    return data


def _make_default_cachet() -> bytes:
    """
    Génère un cachet par défaut : cercle violet avec le texte "CACHET".

    Input  : aucun
    Output : bytes — image PNG (110×110 px)
    """
    doc = fitz.open()
    page = doc.new_page(width=110, height=110)
    page.draw_circle(fitz.Point(55, 55), 50, color=(0.42, 0.2, 0.75), width=2.5)
    page.insert_text(fitz.Point(20, 61), "CACHET", fontsize=14, color=(0.42, 0.2, 0.75))
    pix = page.get_pixmap(alpha=False)
    data = pix.tobytes("png")
    doc.close()
    return data


def _load_asset(stem: str, fallback_fn) -> bytes:
    """
    Cherche une image personnalisée dans data/assets/ (volume persistant Docker).
    Tente les extensions png, jpg, jpeg dans cet ordre.
    Si aucun fichier n'est trouvé, appelle fallback_fn() pour générer le défaut.

    Pour utiliser ta propre signature : dépose  data/assets/signature.png (ou .jpg)
    Pour utiliser ton propre cachet   : dépose  data/assets/cachet.png    (ou .jpg)

    Input  : stem       — nom du fichier sans extension ("signature" ou "cachet")
             fallback_fn — fonction appelée si le fichier est absent
    Output : bytes — contenu brut de l'image (PNG ou JPEG)
    """
    from pathlib import Path
    base = Path("data/assets")
    for ext in ("png", "jpg", "jpeg"):
        path = base / f"{stem}.{ext}"
        if path.exists():
            return path.read_bytes()
    return fallback_fn()


# Chargés une seule fois au démarrage du module et gardés en mémoire
_DEFAULT_SIGNATURE: bytes = _load_asset("signature", _make_default_signature)
_DEFAULT_CACHET: bytes    = _load_asset("cachet",    _make_default_cachet)


# ──────────────────────────────────────────────────────────────────────────────
# Détection des zones signature / cachet par token matching
# ──────────────────────────────────────────────────────────────────────────────

# Chaque token est cherché comme SOUS-CHAÎNE dans le texte de la ligne (lowercase).
# → "signatureet" contient "signature"  ✓ (PDF avec mot fusionné sans espace)
# → "soumissionnaires" contient "soumissionnaire"  ✓ (pluriel)
# → "concurrent" contient "concurrent"  ✓
_SIG_TOKENS = ["signature", "signataire", "soumissionnaire"]
_CAC_TOKENS = ["cachet", "concurrent"]


def _extract_lines(page: fitz.Page) -> list[tuple[str, fitz.Rect]]:
    """
    Extrait toutes les lignes de texte d'une page PDF.
    Chaque ligne est la concaténation de ses spans (fragments de texte).

    Input  : page — fitz.Page (une page du document PDF)
    Output : list of (texte_lowercase, rect)
             — texte : contenu de la ligne en minuscules
             — rect  : bounding box de la ligne en points PDF (1pt = 1/72 pouce)
    """
    lines = []
    for block in page.get_text("dict").get("blocks", []):
        for line in block.get("lines", []):
            spans = line.get("spans", [])
            if not spans:
                continue
            text = "".join(s["text"] for s in spans).lower()
            x0 = min(s["bbox"][0] for s in spans)
            y0 = min(s["bbox"][1] for s in spans)
            x1 = max(s["bbox"][2] for s in spans)
            y1 = max(s["bbox"][3] for s in spans)
            lines.append((text, fitz.Rect(x0, y0, x1, y1)))
    return lines


def _score_line(text: str, tokens: list[str]) -> int:
    """
    Calcule le score d'une ligne pour un ensemble de tokens.
    Score = nombre de tokens présents comme sous-chaîne dans le texte.
    Plus le score est élevé, plus la ligne est pertinente pour cette zone.

    Input  : text   — texte de la ligne (lowercase)
             tokens — liste de tokens à chercher (ex: _SIG_TOKENS)
    Output : int — nombre de tokens trouvés (0 = aucune correspondance)
    """
    return sum(1 for t in tokens if t in text)


def _find_zone_below(page: fitz.Page, below_y: float) -> fitz.Rect | None:
    """
    Cherche une zone signature/cachet sur la page uniquement en dessous de below_y.
    Utilisé pour détecter la zone de signature sous une ligne "Fait à" :
    si un document a "Fait à … le …" suivi d'une zone de signature sur la même page,
    il faut aussi y placer la signature.

    Input  : page    — fitz.Page
             below_y — seuil : seules les lignes avec y0 > below_y sont candidates
    Output : fitz.Rect de la ligne détectée, ou None
    """
    lines = _extract_lines(page)
    all_tokens = _SIG_TOKENS + _CAC_TOKENS
    best: tuple[int, float, fitz.Rect] | None = None

    for text, rect in lines:
        if rect.y0 <= below_y:
            continue  # ignore les lignes au-dessus ou sur la ligne "Fait à"
        s = _score_line(text, all_tokens)
        if s > 0:
            if best is None or s > best[0] or (s == best[0] and rect.y0 > best[1]):
                best = (s, rect.y0, rect)

    return best[2] if best else None


def _find_zone_on_last_page(page: fitz.Page) -> fitz.Rect | None:
    """
    Cherche sur la dernière page la ligne ayant le score combiné
    (sig + cac tokens) le plus élevé.

    Réservé à la dernière page pour éviter les faux positifs : les mots-clés
    "signature", "soumissionnaire", "cachet" peuvent apparaître dans le corps
    du document (clauses, articles…) sans désigner une zone de signature.

    La ligne avec le meilleur score total est retenue. Si ex-æquo, la ligne
    la plus basse dans la page est préférée (les zones de signature sont
    généralement en bas du dernier feuillet).

    Input  : page — fitz.Page (doit être la dernière page du document)
    Output : fitz.Rect — bounding box de la ligne détectée, ou None si aucune
             ligne ne contient de token signature/cachet
    """
    lines  = _extract_lines(page)
    best: tuple[int, float, fitz.Rect] | None = None  # (score, y0, rect)

    all_tokens = _SIG_TOKENS + _CAC_TOKENS
    for text, rect in lines:
        s = _score_line(text, all_tokens)
        if s > 0:
            # Priorité : score élevé, puis position basse dans la page
            if best is None or s > best[0] or (s == best[0] and rect.y0 > best[1]):
                best = (s, rect.y0, rect)

    return best[2] if best else None


def _place_image_below(
    page: fitz.Page,
    keyword_rect: fitz.Rect,
    image_bytes: bytes,
    img_w: int,
    img_h: int,
    gap: int = 6,
) -> None:
    """
    Place une image juste en dessous d'un rectangle de référence (le header détecté),
    alignée sur le bord gauche de ce rectangle.
    Si l'image déborderait en bas de page, elle est placée au-dessus du header.

    Input  : page         — fitz.Page à modifier (en place)
             keyword_rect — rect du header détecté (ex: "Signature du soumissionnaire")
             image_bytes  — contenu brut de l'image (PNG ou JPEG)
             img_w        — largeur cible en points PDF
             img_h        — hauteur cible en points PDF
             gap          — espace entre le bas du header et le haut de l'image (défaut 6pt)
    Output : None — modifie la page en place
    """
    ph = page.rect.height
    x0 = keyword_rect.x0
    y0 = keyword_rect.y1 + gap
    y1 = y0 + img_h

    # Débordement bas de page → on remonte au-dessus du header
    if y1 > ph - 10:
        y1 = keyword_rect.y0 - gap
        y0 = y1 - img_h

    page.insert_image(fitz.Rect(x0, y0, x0 + img_w, y1), stream=image_bytes, keep_proportion=True)


# ──────────────────────────────────────────────────────────────────────────────
# Détection et remplissage de la ligne "Fait à …, le …"
# ──────────────────────────────────────────────────────────────────────────────

def _find_fait_a_span(page: fitz.Page) -> tuple[fitz.Rect | None, float]:
    """
    Cherche dans la page la ligne contenant "Fait à" (ou "Fait a" sans accent).
    Parcourt les spans directement pour être robuste aux encodages PDF variables
    (l'accent "à" peut être encodé différemment selon le générateur du PDF).

    Input  : page — fitz.Page
    Output : (rect, fontsize)
             — rect     : bounding box du premier span de la ligne (ou None)
             — fontsize : taille de police du span trouvé (défaut 10.0 si non trouvé)
    """
    for block in page.get_text("dict").get("blocks", []):
        for line in block.get("lines", []):
            full_line = "".join(s["text"] for s in line.get("spans", []))
            if "Fait" in full_line and ("\u00e0" in full_line or "ait a" in full_line.lower()):
                spans = line.get("spans", [])
                if spans:
                    first = spans[0]
                    return fitz.Rect(first["bbox"]), first["size"]
    return None, 10.0


def _fill_fait_a(page: fitz.Page, lieu: str, date_str: str) -> None:
    """
    Remplace la ligne "Fait à………, le………" dans la page par "Fait à [lieu], le [date]".
    Conserve la taille de police d'origine du document.

    Stratégie : on efface la bande horizontale complète de la ligne avec un
    rectangle blanc (couvre les points, tirets ou underscores du placeholder),
    puis on réécrit le texte reconstruit à la même position.

    Input  : page     — fitz.Page à modifier (en place)
             lieu     — ville à insérer (ex: "Casablanca"), peut être vide
             date_str — date à insérer (ex: "16/03/2026"), peut être vide
    Output : None — modifie la page en place. Ne fait rien si lieu ET date sont vides,
             ou si "Fait à" n'est pas trouvé sur cette page.
    """
    if not lieu and not date_str:
        return

    rect, fontsize = _find_fait_a_span(page)
    if rect is None:
        return

    # Rectangle blanc qui efface toute la ligne (y compris les …… placeholders)
    line_rect = fitz.Rect(rect.x0, rect.y0 - 2, page.rect.width - 15, rect.y1 + 2)
    page.draw_rect(line_rect, color=(1.0, 1.0, 1.0), fill=(1.0, 1.0, 1.0))

    # Reconstruction du texte final
    text = "Fait \u00e0"  # "Fait à"
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


# ──────────────────────────────────────────────────────────────────────────────
# Fonction principale
# ──────────────────────────────────────────────────────────────────────────────

def sign_pdf(
    pdf_bytes: bytes,
    signature_bytes: Optional[bytes] = None,
    cachet_bytes: Optional[bytes] = None,
    sig_w: int = 120,
    sig_h: int = 50,
    sig_mx: int = 50,
    sig_my: int = 40,
    cac_w: int = 100,
    cac_h: int = 100,
    cac_mx: int = 50,
    cac_my: int = 40,
    fait_a_lieu: str = "",
    fait_a_date: str = "",
) -> bytes:
    """
    Traite un PDF en trois étapes :

    1. FAIT À — Remplit "Fait à [lieu], le [date]" sur chaque page où la ligne
       est présente (détection par contenu textuel).

    2. SIGNATURE — Cherche le header "signature du soumissionnaire" (ou variantes)
       sur toutes les pages. Si trouvé : place l'image juste en dessous.
       Si non trouvé (fallback) : place en bas à droite de chaque page.

    3. CACHET — Même logique pour "cachet du concurrent".
       Fallback : bas à gauche de la dernière page uniquement.

    Input  :
        pdf_bytes       — contenu brut du PDF à traiter
        signature_bytes — image de signature (PNG/JPEG), None = utilise le défaut
        cachet_bytes    — image de cachet    (PNG/JPEG), None = utilise le défaut
        sig_w / sig_h   — dimensions de la signature en points PDF (défaut 120×50)
        sig_mx / sig_my — marges fallback depuis bord droit/bas (défaut 50/40)
        cac_w / cac_h   — dimensions du cachet   en points PDF (défaut 100×100)
        cac_mx / cac_my — marges fallback depuis bord gauche/bas (défaut 50/40)
        fait_a_lieu     — ville à insérer dans "Fait à …" (vide = pas de remplissage)
        fait_a_date     — date  à insérer dans "… le …"   (vide = pas de remplissage)

    Output : bytes — contenu brut du PDF signé
    """
    sig = signature_bytes or _DEFAULT_SIGNATURE
    cac = cachet_bytes   or _DEFAULT_CACHET

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    n_pages = len(doc)

    # Pré-scan : zone signature/cachet sur la dernière page uniquement
    last_kw_rect = _find_zone_on_last_page(doc[n_pages - 1])

    for i, page in enumerate(doc):
        pw = page.rect.width
        ph = page.rect.height
        is_last = (i == n_pages - 1)

        # Cherche "Fait à" avant de l'effacer (pour connaître sa position y)
        fait_rect, _ = _find_fait_a_span(page)

        # Remplit "Fait à [lieu], le [date]"
        _fill_fait_a(page, fait_a_lieu, fait_a_date)

        if fait_rect is not None:
            # Page avec "Fait à" → cherche une zone de signature EN DESSOUS uniquement.
            # On ne recherche pas les mots-clés sur le reste de la page pour éviter
            # les faux positifs dans les paragraphes de texte.
            zone = _find_zone_below(page, fait_rect.y1)
            if zone is not None:
                _place_image_below(page, zone, cac, cac_w, cac_h)
                _place_image_below(page, zone, sig, sig_w, sig_h)

        elif is_last:
            # Dernière page sans "Fait à" → logique mots-clés + cachet
            if last_kw_rect is not None:
                _place_image_below(page, last_kw_rect, cac, cac_w, cac_h)
                _place_image_below(page, last_kw_rect, sig, sig_w, sig_h)
            else:
                # Fallback absolu : cachet en bas à gauche uniquement
                page.insert_image(
                    fitz.Rect(cac_mx, ph - cac_my - cac_h, cac_mx + cac_w, ph - cac_my),
                    stream=cac, keep_proportion=True,
                )

        # Signature en bas à droite sur TOUTES les pages (paraphe)
        page.insert_image(
            fitz.Rect(pw - sig_mx - sig_w, ph - sig_my - sig_h, pw - sig_mx, ph - sig_my),
            stream=sig, keep_proportion=True,
        )

    output = io.BytesIO()
    doc.save(output)
    doc.close()
    return output.getvalue()