"""
Scraper — Dossiers de consultation ONCF (marchespublics.gov.ma)
===============================================================
Lance depuis la racine du projet :
    python rd/scrapper/scraper_oncf.py

Flux complet (5 étapes par AO) :
    1. Recherche avancée → filtre "Acheteur public = ONCF" → liste des AOs
    2. Pour chaque AO : ouvrir la fiche de détail
    3. Cliquer sur "Dossier de consultation" → page formulaire de retrait
    4. Remplir le formulaire (nom / prénom / email fictifs + accepter CGU)
    5. Valider → le lien de téléchargement apparaît → télécharger le ZIP

Notes techniques :
    - Le site utilise le framework PRADO (ASP.NET-like) : les IDs de champs
      ont la forme ctl0$CONTENU_PAGE$NomComposant$nomChamp.
    - Après validation du formulaire, la page se met à jour en AJAX (PRADO
      postback) : l'URL ne change pas mais le DOM est mis à jour.
      D'où le asyncio.sleep(5) après Valider.
    - Le bouton "Annuler" apparaît AVANT "Valider" dans le DOM → on cible
      le bouton Valider par son ID exact pour éviter de cliquer le mauvais.
    - Playwright doit tourner dans son propre ProactorEventLoop (thread séparé)
      si lancé depuis Jupyter sur Windows. En script .py normal, asyncio.run()
      suffit car il crée automatiquement un ProactorEventLoop sur Windows.
"""
import asyncio
import json
import re
import sqlite3
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

from playwright.async_api import async_playwright, Page

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION — modifier ici avant de lancer
# ═══════════════════════════════════════════════════════════════════════════════

# Identité fictive utilisée dans le formulaire de retrait du dossier.
# Le site demande nom/prénom/email pour enregistrer le retrait.
# Ces informations n'ont pas besoin d'être réelles.
FAKE_NOM    = "Dupont"
FAKE_PRENOM = "Jean"
FAKE_EMAIL  = "jean.dupont@exemple.ma"

# Nom exact de l'acheteur tel qu'il apparaît dans l'autocomplete du site.
ACHETEUR = "OFFICE NATIONAL DES CHEMINS DE FER"

# Nombre maximum d'AOs à traiter. Mettre 1 pour tester, 20 pour la prod.
MAX_AOS = 1

# False = le navigateur Chromium s'ouvre visuellement (recommandé pour debug).
# True  = mode fantôme, plus rapide mais sans interface.
HEADLESS = False

# Délai en ms entre chaque action Playwright (utile sur les sites lents).
# Réduire à 100-200 si le site répond vite.
SLOW_MO = 300

# Dossiers de sortie (relatifs à la racine du projet).
OUTPUT_DIR = Path("rd/scrapper/output/oncf")   # ZIPs téléchargés
DEBUG_DIR  = OUTPUT_DIR / "debug"               # Screenshots + HTML de debug

# Base de données SQLite locale (R&D uniquement — sera remplacée par PostgreSQL en prod).
DB_PATH = Path("rd/scrapper/ao_catalog.db")

# URL de la recherche avancée sur marchespublics.gov.ma
SEARCH_URL = (
    "https://www.marchespublics.gov.ma"
    "/index.php?page=entreprise.EntrepriseAdvancedSearch&searchAnnCons"
)
BASE_URL = "https://www.marchespublics.gov.ma"


# ═══════════════════════════════════════════════════════════════════════════════
# BASE DE DONNÉES (R&D)
# ═══════════════════════════════════════════════════════════════════════════════

def init_db() -> sqlite3.Connection:
    """
    Crée (ou ouvre) la base SQLite locale et initialise la table appels_offre.

    Si la table existe déjà (ancien schéma), on ajoute les nouvelles colonnes
    via ALTER TABLE de façon silencieuse (les colonnes déjà présentes sont ignorées).

    Retourne une connexion sqlite3 ouverte (à fermer après usage).
    """
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row

    conn.execute("""
        CREATE TABLE IF NOT EXISTS appels_offre (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            ref_consultation TEXT    UNIQUE NOT NULL,
            reference        TEXT,
            titre            TEXT,
            objet            TEXT,
            acheteur         TEXT,
            acheteur_detail  TEXT,
            type_annonce     TEXT,
            procedure        TEXT,
            categorie        TEXT,
            contact_nom      TEXT,
            contact_email    TEXT,
            contact_tel      TEXT,
            date_limite      TEXT,
            url_detail       TEXT,
            zip_path         TEXT,
            scraped_at       TEXT    NOT NULL,
            statut           TEXT    NOT NULL DEFAULT 'disponible'
        )
    """)

    # Migration silencieuse : ajouter les colonnes absentes si la table existait déjà
    new_columns = [
        ("reference",       "TEXT"),
        ("objet",           "TEXT"),
        ("acheteur_detail", "TEXT"),
        ("type_annonce",    "TEXT"),
        ("procedure",       "TEXT"),
        ("categorie",       "TEXT"),
        ("contact_nom",     "TEXT"),
        ("contact_email",   "TEXT"),
        ("contact_tel",     "TEXT"),
    ]
    existing = {row[1] for row in conn.execute("PRAGMA table_info(appels_offre)")}
    for col_name, col_type in new_columns:
        if col_name not in existing:
            conn.execute(f"ALTER TABLE appels_offre ADD COLUMN {col_name} {col_type}")

    conn.commit()
    return conn


def upsert_ao(conn: sqlite3.Connection, result: "AOResult") -> None:
    """
    Insère un AO en base, ou met à jour la ligne existante si la ref est déjà connue.
    Les champs enrichis (reference, objet, etc.) sont best-effort : NULL si non extraits.
    """
    conn.execute("""
        INSERT INTO appels_offre
            (ref_consultation, reference, titre, objet, acheteur, acheteur_detail,
             type_annonce, procedure, categorie, contact_nom, contact_email, contact_tel,
             date_limite, url_detail, zip_path, scraped_at, statut)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ref_consultation) DO UPDATE SET
            reference       = excluded.reference,
            titre           = excluded.titre,
            objet           = excluded.objet,
            acheteur_detail = excluded.acheteur_detail,
            type_annonce    = excluded.type_annonce,
            procedure       = excluded.procedure,
            categorie       = excluded.categorie,
            contact_nom     = excluded.contact_nom,
            contact_email   = excluded.contact_email,
            contact_tel     = excluded.contact_tel,
            date_limite     = excluded.date_limite,
            zip_path        = excluded.zip_path,
            scraped_at      = excluded.scraped_at,
            statut          = excluded.statut
    """, (
        result.ref_consultation,
        result.reference,
        result.titre,
        result.objet,
        ACHETEUR,
        result.acheteur_detail,
        result.type_annonce,
        result.procedure,
        result.categorie,
        result.contact_nom,
        result.contact_email,
        result.contact_tel,
        result.date_limite,
        result.url_detail,
        result.fichier_path,
        datetime.now().isoformat(timespec="seconds"),
        "disponible" if result.fichier_path else "erreur_scraping",
    ))
    conn.commit()


# ═══════════════════════════════════════════════════════════════════════════════
# MODÈLE DE DONNÉES
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class AOResult:
    """Résultat du scraping pour un appel d'offres."""
    ref_consultation: str           # ex : "981730"
    titre:            str           # ex : "[25S038] Réalisation des travaux..."
    url_detail:       str           # URL de la fiche de détail
    fichier_path:     Optional[str] = None   # chemin local du ZIP téléchargé
    erreur:           Optional[str] = None   # message d'erreur si échec
    # Champs enrichis extraits de la page de détail (best-effort, peuvent être None)
    reference:        Optional[str] = None   # ex : "25S038"
    objet:            Optional[str] = None   # description complète
    acheteur_detail:  Optional[str] = None   # ex : "M3 / ONCF - OFFICE NATIONAL..."
    type_annonce:     Optional[str] = None   # ex : "Annonce de consultation"
    procedure:        Optional[str] = None   # ex : "Appel d'offres ouvert | Au rabais"
    categorie:        Optional[str] = None   # ex : "Services"
    contact_nom:      Optional[str] = None   # ex : "NABIL BEN MESSAOUD"
    contact_email:    Optional[str] = None   # ex : "h38710@oncf.ma"
    contact_tel:      Optional[str] = None   # ex : "05 37 77 47 47"
    date_limite:      Optional[str] = None   # ex : "22/04/2026 09:00"


# ═══════════════════════════════════════════════════════════════════════════════
# UTILITAIRES
# ═══════════════════════════════════════════════════════════════════════════════

def normalize_url(href: str) -> str:
    """
    Convertit une URL relative en URL absolue.
    Ex : "/index.php?..." → "https://www.marchespublics.gov.ma/index.php?..."
    """
    if not href:
        return ""
    if href.startswith("http"):
        return href   # déjà absolue
    if href.startswith("/"):
        return BASE_URL + href
    return BASE_URL + "/" + href


def extract_ref(url: str) -> str:
    """
    Extrait le numéro de référence de consultation depuis une URL.
    Ex : "...refConsultation=981730&..." → "981730"
    """
    m = re.search(r"refConsultation=(\d+)", url)
    return m.group(1) if m else url.split("=")[-1][:20]


async def safe_click(page: Page, selector: str, timeout: int = 8000) -> bool:
    """
    Clique sur le premier élément correspondant au sélecteur CSS/XPath.
    Retourne True si le clic a réussi, False si l'élément n'existe pas
    ou si une exception est levée (timeout, élément non cliquable…).
    """
    try:
        await page.locator(selector).first.click(timeout=timeout)
        return True
    except Exception:
        return False


async def safe_fill(page: Page, selector: str, value: str) -> bool:
    """
    Remplit le premier champ correspondant au sélecteur avec la valeur donnée.
    Retourne True si l'opération a réussi, False sinon.
    """
    try:
        await page.locator(selector).first.fill(value)
        return True
    except Exception:
        return False


def save_debug(page_content: str, name: str) -> None:
    """Sauvegarde une page HTML dans le dossier debug (pour investigation)."""
    (DEBUG_DIR / f"{name}.html").write_text(page_content, encoding="utf-8")


# ═══════════════════════════════════════════════════════════════════════════════
# ÉTAPE 1 — RECHERCHE ET EXTRACTION DES LIENS
# ═══════════════════════════════════════════════════════════════════════════════

async def get_ao_links(page: Page) -> list[dict]:
    """
    Ouvre la recherche avancée, filtre par acheteur ONCF, récupère les liens
    vers les fiches de consultation.

    Retourne une liste de dicts : [{"titre": "...", "url": "..."}, ...]

    Détails techniques :
    - Le champ "Acheteur public" est un input autocomplete : on tape les 6
      premiers caractères et on attend la liste de suggestions.
    - Les liens vers les fiches utilisent 'EntrepriseDetailConsultation'
      (sans S final), à ne pas confondre avec les compteurs de retraits/dépôts
      qui utilisent 'EntrepriseDetailsConsultation' (avec S).
    - Le titre et la référence se trouvent dans le même <tr> que le lien,
      dans des divs d'IDs 'panelBlocObjet' et span d'IDs 'reference'.
    """
    print("➡️  Ouverture de la page de recherche...")
    await page.goto(SEARCH_URL, wait_until="domcontentloaded", timeout=30_000)
    await asyncio.sleep(2)

    # ── Sauvegarde debug de la page initiale ──────────────────────────────────
    await page.screenshot(path=str(DEBUG_DIR / "01_page_initiale.png"), full_page=True)
    (DEBUG_DIR / "01_page_initiale.html").write_text(await page.content(), encoding="utf-8")
    print(f"   📸 Page initiale sauvegardée dans {DEBUG_DIR}/")

    # ── Remplir le champ autocomplete "Acheteur public" ───────────────────────
    # L'ID exact du champ a été identifié en inspectant 01_page_initiale.html.
    # On tape seulement les 6 premiers caractères pour déclencher l'autocomplete.
    field = page.locator("input[name='ctl0$CONTENU_PAGE$AdvancedSearch$orgName']")
    if await field.count() == 0:
        raise RuntimeError(
            "Champ 'Acheteur public' non trouvé. "
            f"Inspecte {DEBUG_DIR}/01_page_initiale.html pour vérifier."
        )

    await field.click()
    await field.fill("")
    await field.type(ACHETEUR[:6], delay=100)   # frappe simulée → déclenche l'autocomplete
    await asyncio.sleep(2)                       # attendre que les suggestions chargent

    # ── Cliquer sur la bonne suggestion dans la liste déroulante ─────────────
    result_div = page.locator("#ctl0_CONTENU_PAGE_AdvancedSearch_orgName_result")
    try:
        await result_div.wait_for(state="visible", timeout=5000)

        # Chercher la suggestion qui contient les 10 premiers caractères d'ACHETEUR
        suggestion = result_div.locator(f"li:has-text('{ACHETEUR[:10]}')")
        if await suggestion.count() > 0:
            await suggestion.first.click()
            print(f"   ✅ Acheteur sélectionné via autocomplete")
        else:
            # Fallback : prendre la première suggestion disponible
            first_suggestion = result_div.locator("li").first
            txt = await first_suggestion.inner_text()
            await first_suggestion.click()
            print(f"   ✅ Première suggestion : {txt.strip()[:60]}")

    except Exception:
        # L'autocomplete n'a pas répondu → remplir directement le champ
        await field.fill(ACHETEUR)
        print("   ⚠️  Autocomplete non détecté, texte saisi directement")

    await asyncio.sleep(0.5)

    # ── Lancer la recherche ───────────────────────────────────────────────────
    # Le bouton "Lancer la recherche" a un ID stable sur ce site.
    # Les sélecteurs suivants sont testés dans l'ordre (du plus précis au plus générique).
    submit_selectors = [
        "#ctl0_CONTENU_PAGE_AdvancedSearch_lancerRecherche",  # ID exact (identifié dans HTML)
        "input[value='Lancer la recherche']",                 # par valeur
        "input[name*='lancerRecherche']",                     # par nom partiel
        "input[value*='Lancer']",                             # par valeur partielle
        "input[type='submit']",                               # fallback générique
    ]
    submitted = False
    for sel in submit_selectors:
        if await safe_click(page, sel):
            print(f"   ✅ Recherche lancée via '{sel}'")
            submitted = True
            break

    if not submitted:
        raise RuntimeError("Bouton 'Lancer la recherche' non trouvé.")

    await asyncio.sleep(3)   # attendre le chargement des résultats

    # ── Sauvegarde debug de la page de résultats ──────────────────────────────
    await page.screenshot(path=str(DEBUG_DIR / "02_resultats.png"), full_page=True)
    (DEBUG_DIR / "02_resultats.html").write_text(await page.content(), encoding="utf-8")
    print("   📸 Page résultats sauvegardée")

    # ── Extraire les liens + titres via JavaScript ────────────────────────────
    # On utilise page.evaluate() pour lire le DOM directement dans le navigateur.
    # Pour chaque ligne de résultat, on extrait :
    #   - href  : lien vers la fiche (contient 'EntrepriseDetailConsultation' sans S)
    #   - objet : description de l'AO (dans div[id*='panelBlocObjet'])
    #   - ref   : référence courte ex "25S038" (dans span[id*='reference'])
    raw: list[dict] = await page.evaluate(f"""
        () => {{
            // Sélectionner uniquement les liens "Accéder à la consultation"
            // (sans S dans DetailConsultation) pour éviter les liens de compteurs
            // (retraits, dépôts, questions) qui ont "DetailsConsultation" avec S.
            const links = document.querySelectorAll('a[href*="EntrepriseDetailConsultation"]');
            const results = [];

            for (const a of links) {{
                const href = a.href;

                // Remonter jusqu'à la ligne du tableau pour trouver l'objet et la référence
                const row    = a.closest('tr') || a.closest('td') || a.parentElement;
                const objDiv = row ? row.querySelector('[id*="panelBlocObjet"]')  : null;
                const refSpan = row ? row.querySelector('[id*="reference"]')      : null;

                const objet = objDiv  ? objDiv.innerText.replace('Objet', '').replace(':', '').trim() : '';
                const ref   = refSpan ? refSpan.innerText.trim() : '';

                results.push({{ href, objet, ref }});
                if (results.length >= {MAX_AOS}) break;   // respecter la limite MAX_AOS
            }}
            return results;
        }}
    """)

    # ── Construire la liste finale ────────────────────────────────────────────
    links: list[dict] = []
    seen:  set[str]   = set()

    for i, item in enumerate(raw):
        href = normalize_url(item.get("href", ""))
        if not href or href in seen:
            continue   # ignorer les doublons
        seen.add(href)

        objet = item.get("objet", "").replace("\n", " ").strip()
        ref   = item.get("ref", "")
        titre = f"[{ref}] {objet}" if ref else objet or f"AO #{i+1}"

        links.append({"titre": titre[:150], "url": href})

    if not links:
        raise RuntimeError(
            f"Aucun AO trouvé dans les résultats. "
            f"Inspecte {DEBUG_DIR}/02_resultats.html pour comprendre."
        )

    print(f"\n   ✅ {len(links)} AO trouvé(s) :")
    for i, l in enumerate(links, 1):
        print(f"      {i:2d}. {l['titre'][:80]}")

    return links


# ═══════════════════════════════════════════════════════════════════════════════
# ÉTAPE 2 — TÉLÉCHARGEMENT DU DOSSIER POUR UN AO
# ═══════════════════════════════════════════════════════════════════════════════

async def download_dossier(page: Page, ao: dict, idx: int) -> AOResult:
    """
    Télécharge le dossier de consultation d'un AO en 5 sous-étapes :

    A. Aller sur la fiche de détail (EntrepriseDetailConsultation)
    B. Cliquer sur le lien "Dossier de consultation" → navigue vers
       la page de formulaire (EntrepriseDemandeTelechargementDce)
    C. Remplir le formulaire : nom, prénom, email, cocher les CGU
    D. Cliquer sur "Valider" → PRADO postback (AJAX, URL inchangée)
       Le DOM se met à jour pour afficher le lien de téléchargement
    E. Cliquer sur le lien de téléchargement → ZIP sauvegardé localement

    En cas d'erreur à n'importe quelle étape, un screenshot est sauvegardé
    dans DEBUG_DIR/erreur_<ref>.png pour faciliter le debug.
    """
    ref    = extract_ref(ao["url"])
    result = AOResult(ref_consultation=ref, titre=ao["titre"], url_detail=ao["url"])

    try:
        # ── A : ouvrir la fiche de détail ─────────────────────────────────────
        print(f"      → Ouverture de la fiche...")
        await page.goto(ao["url"], wait_until="domcontentloaded", timeout=30_000)
        await asyncio.sleep(2)

        # ── A' : extraire les métadonnées enrichies (best-effort) ─────────────
        # Tous les champs ont un ID stable dans la page de détail PRADO.
        # Si un ID est absent du DOM, inner_text() retourne "" → on stocke None.
        def _txt(s: str) -> Optional[str]:
            """Retourne s ou None si vide."""
            return s.strip() or None

        async def _get(suffix: str) -> Optional[str]:
            # Le préfixe du composant PRADO varie selon la page (ctl5, idEntrepriseConsultationSummary…)
            # → on cible les spans dont l'ID se TERMINE par le suffixe stable.
            loc = page.locator(f'[id$="_{suffix}"]')
            if await loc.count() == 0:
                return None
            return _txt(await loc.first.inner_text())

        result.reference       = await _get("reference")
        result.objet           = await _get("objet")
        result.acheteur_detail = await _get("entiteAchat")
        result.type_annonce    = await _get("annonce")
        result.categorie       = await _get("categoriePrincipale")
        result.contact_nom     = await _get("contactAdministratif")
        result.contact_email   = await _get("email")
        result.contact_tel     = await _get("telephone")
        result.date_limite     = await _get("dateHeureLimiteRemisePlis")

        # Procédure = typeProcedure + modePassation (facultatif)
        type_proc = await _get("typeProcedure")
        mode_pass = await _get("modePassation")
        if type_proc and mode_pass:
            result.procedure = f"{type_proc} {mode_pass}".strip()
        else:
            result.procedure = type_proc or mode_pass

        if result.reference or result.objet:
            print(f"      📋 Réf: {result.reference} | Date limite: {result.date_limite} | Procédure: {result.procedure}")

        # ── B : cliquer sur "Dossier de consultation" ─────────────────────────
        # Ce lien a un ID stable identifié dans le HTML : linkDownloadDce.
        # Il navigue vers EntrepriseDemandeTelechargementDce (page formulaire).
        dce_loc = page.locator(
            "#ctl0_CONTENU_PAGE_linkDownloadDce, "           # ID exact (stable)
            "a[href*='TelechargementDce'], "                 # fallback sur l'URL
            "a[href*='EntrepriseDemandeTelechargement']"     # fallback plus large
        )
        if await dce_loc.count() == 0:
            raise RuntimeError(
                "Lien 'Dossier de consultation' introuvable. "
                "La consultation est peut-être clôturée ou sans DCE."
            )
        await dce_loc.first.click()
        await asyncio.sleep(2)
        print(f"      → Formulaire chargé : {page.url}")

        # Debug : sauvegarde de la page formulaire
        await page.screenshot(path=str(DEBUG_DIR / f"form_{ref}.png"), full_page=True)

        # ── C : remplir le formulaire de retrait ──────────────────────────────
        # Les IDs exacts ont été identifiés en inspectant le HTML du formulaire
        # (fichier debug/02b_formulaire_*.html sauvegardé lors du développement).
        # Format PRADO : ctl0_CONTENU_PAGE_NomComposant_nomChamp
        await safe_fill(page, "#ctl0_CONTENU_PAGE_EntrepriseFormulaireDemande_nom",    FAKE_NOM)
        await safe_fill(page, "#ctl0_CONTENU_PAGE_EntrepriseFormulaireDemande_prenom", FAKE_PRENOM)
        await safe_fill(page, "#ctl0_CONTENU_PAGE_EntrepriseFormulaireDemande_email",  FAKE_EMAIL)

        # Cocher la case "J'accepte les conditions générales"
        cb = page.locator("#ctl0_CONTENU_PAGE_EntrepriseFormulaireDemande_accepterConditions")
        if await cb.count() > 0 and not await cb.first.is_checked():
            await cb.first.check()

        await asyncio.sleep(0.5)

        # ── D : valider le formulaire ─────────────────────────────────────────
        # ATTENTION : la page contient DEUX boutons submit :
        #   1. "Annuler" (premier dans le DOM → serait cliqué par input[type='submit'])
        #   2. "Valider" (ID : ctl0_CONTENU_PAGE_validateButton)
        # On cible explicitement le bouton Valider par son ID.
        #
        # Après le clic, PRADO envoie une requête AJAX et met à jour le DOM.
        # L'URL NE CHANGE PAS mais le contenu de la page change pour afficher
        # le lien "Télécharger le dossier de consultation".
        # On attend 5 secondes pour laisser le temps à l'AJAX de se terminer.
        await safe_click(page, "#ctl0_CONTENU_PAGE_validateButton", timeout=5000)
        await asyncio.sleep(5)   # attente AJAX (le DOM se met à jour en place)
        print(f"      → Formulaire soumis, attente du lien de téléchargement...")

        # ── E : télécharger le dossier ────────────────────────────────────────
        # Après la mise à jour AJAX, un lien de téléchargement apparaît sur la page.
        # On utilise page.expect_download() qui intercepte le téléchargement
        # déclenché par le navigateur (même si c'est un ZIP, pas un PDF).
        dl_selectors = [
            "a:has-text('Télécharger le dossier de consultation')",  # texte exact
            "a:has-text('Télécharger le dossier')",                  # texte partiel
            "a:has-text('Télécharger')",                             # texte générique
            "a:has-text('Telecharger')",                             # sans accent
            "input[value*='Télécharger']",                          # bouton input
            "a[href*='.zip']",                                       # lien direct ZIP
            "a[href*='.pdf']",                                       # lien direct PDF
            "a[href*='telecharg']",                                  # URL avec "telecharg"
        ]

        downloaded = False
        for sel in dl_selectors:
            loc = page.locator(sel)
            cnt = await loc.count()
            if cnt == 0:
                continue   # ce sélecteur ne matche rien, essayer le suivant

            print(f"      → Clic sur lien de téléchargement : {sel}")
            try:
                # expect_download() intercepte l'événement de téléchargement du navigateur.
                # timeout=30s car les ZIPs peuvent être lourds (>10 Mo).
                async with page.expect_download(timeout=30_000) as dl_info:
                    await loc.first.click()

                download  = await dl_info.value
                # Utiliser le nom de fichier suggéré par le serveur si disponible
                suggested = download.suggested_filename or f"dossier_{ref}.zip"
                dest      = OUTPUT_DIR / f"{idx:02d}_{ref}_{suggested}"
                await download.save_as(str(dest))

                result.fichier_path = str(dest)
                downloaded = True
                print(f"      💾 Sauvegardé : {dest.name}")
                break

            except Exception as ex:
                # Ce sélecteur a matché mais le clic n'a pas déclenché de téléchargement
                # (ex : navigation vers une autre page). On essaie le suivant.
                print(f"         ⚠️  Pas de téléchargement via ce sélecteur : {ex}")
                continue

        if not downloaded:
            raise RuntimeError(
                "Aucun lien de téléchargement trouvé après validation. "
                f"Inspecte {DEBUG_DIR}/form_{ref}.png pour investiguer."
            )

    except Exception as e:
        # Capture l'erreur et un screenshot pour debug
        result.erreur = str(e)
        try:
            await page.screenshot(path=str(DEBUG_DIR / f"erreur_{ref}.png"))
            print(f"      📸 Screenshot erreur : {DEBUG_DIR}/erreur_{ref}.png")
        except Exception:
            pass

    return result


# ═══════════════════════════════════════════════════════════════════════════════
# POINT D'ENTRÉE PRINCIPAL
# ═══════════════════════════════════════════════════════════════════════════════

async def main() -> None:
    """
    Orchestre le scraping complet :
    1. Lance Chromium via Playwright
    2. Récupère la liste des AOs ONCF (get_ao_links)
    3. Télécharge le dossier de chaque AO (download_dossier)
    4. Sauvegarde un rapport JSON avec le bilan
    """
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)

    # Ouvrir (ou créer) la base de données locale
    conn = init_db()
    print(f"🗄️  Base de données : {DB_PATH.resolve()}")

    async with async_playwright() as p:
        # Lancer Chromium.
        # headless=False → navigateur visible (recommandé pour surveiller le scraping)
        # slow_mo        → délai entre actions (évite de surcharger le serveur)
        browser = await p.chromium.launch(headless=HEADLESS, slow_mo=SLOW_MO)

        # Créer un contexte navigateur avec le téléchargement activé.
        # accept_downloads=True est indispensable pour que expect_download() fonctionne.
        ctx  = await browser.new_context(accept_downloads=True)
        page = await ctx.new_page()
        page.set_default_timeout(20_000)   # timeout global = 20s par action

        results: list[AOResult] = []

        try:
            # ── Phase 1 : récupérer tous les liens ────────────────────────────
            ao_links = await get_ao_links(page)

            # ── Phase 2 : télécharger chaque dossier ─────────────────────────
            print(f"\n{'═'*60}")
            print(f"  Téléchargement de {len(ao_links)} dossier(s)...")
            print(f"{'═'*60}")

            for idx, ao in enumerate(ao_links, 1):
                print(f"\n[{idx:2d}/{len(ao_links)}] {ao['titre'][:70]}")
                r = await download_dossier(page, ao, idx)
                results.append(r)

                # Enregistrer en base (succès ou échec)
                upsert_ao(conn, r)

                status = "✅ OK" if r.fichier_path else f"⚠️  {r.erreur}"
                print(f"      {status}")

                # Petite pause entre deux AOs pour ne pas hammer le serveur
                await asyncio.sleep(2)

        finally:
            # Fermer proprement même en cas d'erreur
            await ctx.close()
            await browser.close()

    conn.close()

    # ── Résumé final ──────────────────────────────────────────────────────────
    ok  = [r for r in results if r.fichier_path]
    nok = [r for r in results if not r.fichier_path]

    print(f"\n{'═'*60}")
    print(f"  ✅ {len(ok)} dossier(s) téléchargé(s)")
    print(f"  ⚠️  {len(nok)} échec(s)")
    if nok:
        for r in nok:
            print(f"     - [{r.ref_consultation}] {r.erreur}")
    print(f"{'═'*60}")

    # ── Aperçu de la base de données ──────────────────────────────────────────
    conn2 = sqlite3.connect(str(DB_PATH))
    rows  = conn2.execute(
        "SELECT ref_consultation, titre, statut, zip_path, scraped_at "
        "FROM appels_offre ORDER BY scraped_at DESC LIMIT 10"
    ).fetchall()
    conn2.close()

    print(f"\n  🗄️  Contenu de {DB_PATH} ({len(rows)} ligne(s) affichée(s)) :")
    print(f"  {'REF':<12} {'STATUT':<15} {'TITRE':<55} ZIP")
    print(f"  {'-'*12} {'-'*15} {'-'*55} {'-'*20}")
    for row in rows:
        ref, titre, statut, zip_path, scraped_at = row
        zip_name = Path(zip_path).name[:20] if zip_path else "—"
        print(f"  {ref:<12} {statut:<15} {scraped_at[:16]:<18} {(titre or '')[:45]:<45} {zip_name}")

    # ── Sauvegarde du rapport JSON ─────────────────────────────────────────────
    # Le rapport liste tous les AOs avec leur statut, titre, URL et chemin local.
    if results:
        rapport = OUTPUT_DIR / "rapport.json"
        rapport.write_text(
            json.dumps([asdict(r) for r in results], ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
        print(f"\n  📋 Rapport → {rapport}")

        # Listing des fichiers téléchargés
        fichiers = sorted(OUTPUT_DIR.glob("*.zip")) + sorted(OUTPUT_DIR.glob("*.pdf"))
        if fichiers:
            print(f"\n  📁 Fichiers dans {OUTPUT_DIR}/ :")
            for f in fichiers:
                taille = f.stat().st_size // 1024
                print(f"     {f.name:60s} {taille:>6} Ko")


if __name__ == "__main__":
    # asyncio.run() crée automatiquement un ProactorEventLoop sur Windows,
    # qui supporte les subprocesses requis par Playwright.
    asyncio.run(main())
