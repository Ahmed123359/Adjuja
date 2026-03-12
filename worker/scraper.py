"""
Logique de scraping Playwright pour marchespublics.gov.ma.

Flux complet pour chaque AO :
  1. Recherche avancée → filtre Acheteur public → liste des AOs
  2. Ouvrir la fiche de détail → extraire les métadonnées (best-effort)
  3. Cliquer sur "Dossier de consultation" → page formulaire
  4. Remplir le formulaire (nom / prénom / email + accepter CGU)
  5. Valider → PRADO postback AJAX → lien de téléchargement → ZIP

Notes techniques :
  - PRADO (framework ASP.NET-like) : IDs des composants varient selon la page.
    On cible les attributs id dont le suffixe est stable (ex: [id$="_reference"]).
  - Après Valider, la page se met à jour en AJAX sans changer d'URL.
    D'où le asyncio.sleep(5) post-soumission.
  - Le bouton "Annuler" précède "Valider" dans le DOM → on cible Valider par ID exact.
"""
import asyncio
import logging
import re
from pathlib import Path
from typing import Optional

from playwright.async_api import Page, async_playwright

from .config import WorkerSettings
from .models import AOResult

logger = logging.getLogger(__name__)

BASE_URL = "https://www.marchespublics.gov.ma"
SEARCH_URL = (
    f"{BASE_URL}/index.php?page=entreprise.EntrepriseAdvancedSearch&searchAnnCons"
)


# ═══════════════════════════════════════════════════════════════════════════════
# UTILITAIRES
# ═══════════════════════════════════════════════════════════════════════════════


def _normalize_url(href: str) -> str:
    """Convertit une URL relative en URL absolue."""
    if not href:
        return ""
    if href.startswith("http"):
        return href
    return BASE_URL + (href if href.startswith("/") else f"/{href}")


def _extract_ref(url: str) -> str:
    """Extrait le numéro de consultation depuis une URL PRADO."""
    m = re.search(r"refConsultation=(\d+)", url)
    return m.group(1) if m else url.split("=")[-1][:20]


async def _safe_click(page: Page, selector: str, timeout: int = 8_000) -> bool:
    try:
        await page.locator(selector).first.click(timeout=timeout)
        return True
    except Exception:
        return False


async def _safe_fill(page: Page, selector: str, value: str) -> bool:
    try:
        await page.locator(selector).first.fill(value)
        return True
    except Exception:
        return False


def _save_debug(content: str, name: str, debug_dir: Path) -> None:
    """Persiste une page HTML dans le dossier debug."""
    try:
        debug_dir.mkdir(parents=True, exist_ok=True)
        (debug_dir / f"{name}.html").write_text(content, encoding="utf-8")
    except OSError as exc:
        logger.warning("Impossible de sauvegarder le debug '%s' : %s", name, exc)


# ═══════════════════════════════════════════════════════════════════════════════
# ÉTAPE 1 — LISTE DES AOs
# ═══════════════════════════════════════════════════════════════════════════════


async def _get_ao_links(page: Page, acheteur: str, settings: WorkerSettings, debug_dir: Path) -> list[dict]:
    """
    Ouvre la recherche avancée, filtre par acheteur et retourne la liste des AOs.

    Retourne : [{"titre": str, "url": str, "acheteur": str}, ...]
    """
    logger.info("Recherche pour acheteur : %s", acheteur)
    await page.goto(SEARCH_URL, wait_until="domcontentloaded", timeout=30_000)
    await asyncio.sleep(2)

    _save_debug(await page.content(), "01_page_initiale", debug_dir)

    # Champ autocomplete "Acheteur public"
    field = page.locator("input[name='ctl0$CONTENU_PAGE$AdvancedSearch$orgName']")
    if await field.count() == 0:
        raise RuntimeError(
            "Champ 'Acheteur public' introuvable. "
            f"Inspecte {debug_dir}/01_page_initiale.html"
        )

    await field.click()
    await field.fill("")
    await field.type(acheteur[:6], delay=100)
    await asyncio.sleep(2)

    # Sélectionner la suggestion correspondante
    result_div = page.locator("#ctl0_CONTENU_PAGE_AdvancedSearch_orgName_result")
    try:
        await result_div.wait_for(state="visible", timeout=5_000)
        suggestion = result_div.locator(f"li:has-text('{acheteur[:10]}')")
        if await suggestion.count() > 0:
            await suggestion.first.click()
            logger.info("Acheteur sélectionné via autocomplete")
        else:
            first = result_div.locator("li").first
            txt = await first.inner_text()
            await first.click()
            logger.info("Première suggestion sélectionnée : %s", txt.strip()[:60])
    except Exception:
        await field.fill(acheteur)
        logger.warning("Autocomplete non détecté, texte saisi directement")

    await asyncio.sleep(0.5)

    # Lancer la recherche
    submit_selectors = [
        "#ctl0_CONTENU_PAGE_AdvancedSearch_lancerRecherche",
        "input[value='Lancer la recherche']",
        "input[name*='lancerRecherche']",
        "input[value*='Lancer']",
    ]
    submitted = False
    for sel in submit_selectors:
        if await _safe_click(page, sel):
            logger.info("Recherche lancée via '%s'", sel)
            submitted = True
            break

    if not submitted:
        raise RuntimeError("Bouton 'Lancer la recherche' introuvable.")

    await asyncio.sleep(3)
    _save_debug(await page.content(), "02_resultats", debug_dir)

    # Extraction JS des liens + titres
    raw: list[dict] = await page.evaluate(f"""
        () => {{
            const links = document.querySelectorAll('a[href*="EntrepriseDetailConsultation"]');
            const results = [];
            for (const a of links) {{
                const href = a.href;
                const row     = a.closest('tr') || a.closest('td') || a.parentElement;
                const objDiv  = row ? row.querySelector('[id*="panelBlocObjet"]')  : null;
                const refSpan = row ? row.querySelector('[id*="reference"]')       : null;
                const objet   = objDiv  ? objDiv.innerText.replace('Objet', '').replace(':', '').trim() : '';
                const ref     = refSpan ? refSpan.innerText.trim() : '';
                results.push({{ href, objet, ref }});
                if (results.length >= {settings.max_aos}) break;
            }}
            return results;
        }}
    """)

    links: list[dict] = []
    seen: set[str] = set()

    for i, item in enumerate(raw):
        href = _normalize_url(item.get("href", ""))
        if not href or href in seen:
            continue
        seen.add(href)
        objet = item.get("objet", "").replace("\n", " ").strip()
        ref   = item.get("ref", "")
        titre = f"[{ref}] {objet}" if ref else objet or f"AO #{i + 1}"
        links.append({"titre": titre[:150], "url": href, "acheteur": acheteur})

    if not links:
        raise RuntimeError(
            f"Aucun AO trouvé. Inspecte {debug_dir}/02_resultats.html"
        )

    logger.info("%d AO(s) trouvé(s)", len(links))
    return links


# ═══════════════════════════════════════════════════════════════════════════════
# ÉTAPE 2 — TÉLÉCHARGEMENT D'UN AO
# ═══════════════════════════════════════════════════════════════════════════════


async def _download_dossier(
    page: Page,
    ao: dict,
    idx: int,
    settings: WorkerSettings,
    output_dir: Path,
    debug_dir: Path,
) -> AOResult:
    """
    Télécharge le dossier d'un AO et en extrait les métadonnées.

    Retourne un AOResult avec fichier_path renseigné si succès, erreur sinon.
    """
    ref    = _extract_ref(ao["url"])
    result = AOResult(ref_consultation=ref, titre=ao["titre"], url_detail=ao["url"])

    try:
        # ── A : fiche de détail ───────────────────────────────────────────────
        logger.info("[%d] Ouverture fiche %s", idx, ref)
        await page.goto(ao["url"], wait_until="domcontentloaded", timeout=30_000)
        await asyncio.sleep(2)

        # ── A' : extraction des métadonnées (best-effort) ─────────────────────
        # Le préfixe du composant PRADO varie entre les pages (ctl5,
        # idEntrepriseConsultationSummary…) → on cible le suffixe stable.
        async def _get(suffix: str) -> Optional[str]:
            loc = page.locator(f'[id$="_{suffix}"]')
            if await loc.count() == 0:
                return None
            val = (await loc.first.inner_text()).strip()
            return val or None

        result.reference       = await _get("reference")
        result.objet           = await _get("objet")
        result.acheteur_detail = await _get("entiteAchat")
        result.type_annonce    = await _get("annonce")
        result.categorie       = await _get("categoriePrincipale")
        result.contact_nom     = await _get("contactAdministratif")
        result.contact_email   = await _get("email")
        result.contact_tel     = await _get("telephone")
        result.date_limite     = await _get("dateHeureLimiteRemisePlis")

        type_proc = await _get("typeProcedure")
        mode_pass = await _get("modePassation")
        if type_proc and mode_pass:
            result.procedure = f"{type_proc} {mode_pass}".strip()
        else:
            result.procedure = type_proc or mode_pass

        logger.info(
            "[%d] Métadonnées : réf=%s date=%s procédure=%s",
            idx, result.reference, result.date_limite, result.procedure,
        )

        # ── B : lien "Dossier de consultation" ────────────────────────────────
        dce_loc = page.locator(
            "#ctl0_CONTENU_PAGE_linkDownloadDce, "
            "a[href*='TelechargementDce'], "
            "a[href*='EntrepriseDemandeTelechargement']"
        )
        if await dce_loc.count() == 0:
            raise RuntimeError("Lien 'Dossier de consultation' introuvable.")
        await dce_loc.first.click()
        await asyncio.sleep(2)

        # ── C : formulaire de retrait ──────────────────────────────────────────
        await _safe_fill(page, "#ctl0_CONTENU_PAGE_EntrepriseFormulaireDemande_nom",    settings.fake_nom)
        await _safe_fill(page, "#ctl0_CONTENU_PAGE_EntrepriseFormulaireDemande_prenom", settings.fake_prenom)
        await _safe_fill(page, "#ctl0_CONTENU_PAGE_EntrepriseFormulaireDemande_email",  settings.fake_email)

        cb = page.locator("#ctl0_CONTENU_PAGE_EntrepriseFormulaireDemande_accepterConditions")
        if await cb.count() > 0 and not await cb.first.is_checked():
            await cb.first.check()

        await asyncio.sleep(0.5)

        # ── D : Valider (PRADO AJAX — URL inchangée, DOM mis à jour) ──────────
        await _safe_click(page, "#ctl0_CONTENU_PAGE_validateButton", timeout=5_000)
        await asyncio.sleep(5)

        # ── E : téléchargement ────────────────────────────────────────────────
        dl_selectors = [
            "a:has-text('Télécharger le dossier de consultation')",
            "a:has-text('Télécharger le dossier')",
            "a:has-text('Télécharger')",
            "a:has-text('Telecharger')",
            "input[value*='Télécharger']",
            "a[href*='.zip']",
            "a[href*='.pdf']",
            "a[href*='telecharg']",
        ]

        downloaded = False
        for sel in dl_selectors:
            loc = page.locator(sel)
            if await loc.count() == 0:
                continue
            try:
                async with page.expect_download(timeout=30_000) as dl_info:
                    await loc.first.click()
                download  = await dl_info.value
                suggested = download.suggested_filename or f"dossier_{ref}.zip"
                dest      = output_dir / f"{idx:02d}_{ref}_{suggested}"
                await download.save_as(str(dest))
                result.fichier_path = str(dest)
                downloaded = True
                logger.info("[%d] ZIP sauvegardé : %s", idx, dest.name)
                break
            except Exception as exc:
                logger.warning("[%d] Pas de téléchargement via '%s' : %s", idx, sel, exc)
                continue

        if not downloaded:
            raise RuntimeError("Aucun lien de téléchargement trouvé après validation.")

    except Exception as exc:
        result.erreur = str(exc)
        logger.error("[%d] Échec ref=%s : %s", idx, ref, exc)
        try:
            await page.screenshot(path=str(debug_dir / f"erreur_{ref}.png"))
        except Exception:
            pass

    return result


# ═══════════════════════════════════════════════════════════════════════════════
# POINT D'ENTRÉE PUBLIC
# ═══════════════════════════════════════════════════════════════════════════════


async def run_scrape(settings: WorkerSettings, known_refs: set[str] | None = None) -> list[AOResult]:
    """
    Lance un cycle complet de scraping pour tous les acheteurs configurés.

    Itère sur settings.acheteurs dans la même session Playwright.
    Cette fonction est le seul point d'entrée public du module.
    Elle est appelée par le scheduler (scheduler.py) via asyncio.run().

    known_refs : refs déjà en base (fournis par le scheduler). Les AOs dont
                 la ref est dans cet ensemble sont ignorés (pas de téléchargement).
    """
    known_refs = known_refs or set()
    output_dir = Path(settings.output_dir)
    debug_dir  = output_dir / "debug"
    output_dir.mkdir(parents=True, exist_ok=True)
    debug_dir.mkdir(parents=True, exist_ok=True)

    results: list[AOResult] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=settings.headless,
            slow_mo=settings.slow_mo,
        )
        ctx  = await browser.new_context(accept_downloads=True)
        page = await ctx.new_page()
        page.set_default_timeout(20_000)

        try:
            for acheteur in settings.acheteurs:
                logger.info("=== Acheteur : %s ===", acheteur)
                try:
                    ao_links = await _get_ao_links(page, acheteur, settings, debug_dir)
                except RuntimeError as exc:
                    logger.error("Impossible de récupérer les AOs pour '%s' : %s", acheteur, exc)
                    continue

                for idx, ao in enumerate(ao_links, 1):
                    ref = _extract_ref(ao["url"])
                    if ref in known_refs:
                        logger.info("[%d/%d] AO %s déjà en base — ignoré", idx, len(ao_links), ref)
                        continue
                    logger.info("[%d/%d] %s", idx, len(ao_links), ao["titre"][:80])
                    r = await _download_dossier(page, ao, idx, settings, output_dir, debug_dir)
                    r.acheteur_filtre = acheteur
                    results.append(r)
                    await asyncio.sleep(2)

        finally:
            await ctx.close()
            await browser.close()

    ok  = sum(1 for r in results if r.fichier_path)
    nok = sum(1 for r in results if not r.fichier_path)
    logger.info("Cycle terminé : %d OK, %d échec(s)", ok, nok)
    return results
