import json
import os
import random
import re
import asyncio
from collections.abc import Callable
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.parse import parse_qs, urlparse, urljoin

import httpx
import structlog
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright, Browser, BrowserContext

from app.modules.ao_scraper.base import AoData, IAOScraper

log = structlog.get_logger(__name__)

SCRAPERS_DIR = Path(__file__).parent.parent.parent.parent / "scrapers"


def _collapse_duplicate_title(text: str, anchor_len: int = 40) -> str:
    """Le site source duplique parfois l'objet dans le meme element DOM
    (apercu tronque suivi du texte complet, ou tooltip dupliquant le texte
    visible) -- get_text() capture les deux a la suite. Detecte la
    repetition via un fragment-ancre et ne garde que la deuxieme occurrence
    (la complete, jamais tronquee par une virgule de coupure)."""
    if len(text) < anchor_len * 2:
        return text
    anchor = text[:anchor_len]
    pos = text.find(anchor, anchor_len)
    if pos == -1:
        return text
    return text[pos:].strip()

USER_AGENTS = [
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
]


def _parse_date(raw: str) -> date | None:
    raw = raw.strip()
    for fmt, n in [("%d/%m/%Y %H:%M", 16), ("%d/%m/%Y", 10)]:
        try:
            return datetime.strptime(raw[:n], fmt).date()
        except ValueError:
            pass
    m = re.search(r"(\d{2}/\d{2}/\d{4})", raw)
    if m:
        try:
            return datetime.strptime(m.group(1), "%d/%m/%Y").date()
        except ValueError:
            pass
    return None


def _parse_amount(raw: str) -> Decimal | None:
    raw = re.sub(r"[^\d,.]", "", raw.strip())
    raw = raw.replace(",", ".")
    # If multiple dots, keep only the last
    parts = raw.split(".")
    if len(parts) > 2:
        raw = "".join(parts[:-1]) + "." + parts[-1]
    try:
        return Decimal(raw) if raw else None
    except InvalidOperation:
        return None


def sommes_lots(html: str) -> tuple[Decimal | None, Decimal | None]:
    """(estimation totale, caution totale) depuis la page « détail des lots »
    d'un AO alloti (commun.PopUpDetailLots). None si aucun lot ne publie la
    valeur. Ids vérifiés sur le portail le 2026-10-02."""
    soup = BeautifulSoup(html, "html.parser")

    def somme(motif: str) -> Decimal | None:
        valeurs = [_parse_amount(el.get_text(strip=True)) for el in soup.find_all(id=re.compile(motif))]
        valeurs = [v for v in valeurs if v is not None]
        return sum(valeurs, Decimal(0)) if valeurs else None

    return (somme(r"^ctl0_CONTENU_PAGE_repeaterLots_ctl\d+_.*_labelReferentielZoneText$"),
            somme(r"^ctl0_CONTENU_PAGE_repeaterLots_ctl\d+_cautionProvisoire$"))


def _extract_ref_org(href: str) -> tuple[str, str] | None:
    """Parse refConsultation and orgAcronyme from a detail page href."""
    qs = parse_qs(urlparse(href).query)
    ref = qs.get("refConsultation", [None])[0]
    org = qs.get("orgAcronyme", [None])[0]
    if ref and org:
        return ref, org
    return None


class MPEPlatformScraper(IAOScraper):
    """
    Scraper for any portal running the Marchés Publics Electroniques (MPE) platform.
    Takes a config JSON file as input  selectors and URLs live there, not here.
    """

    def __init__(self, config_name: str):
        config_path = SCRAPERS_DIR / f"{config_name}.config.json"
        with open(config_path) as f:
            self.cfg = json.load(f)

        self.source = self.cfg["name"]
        self.base_url = self.cfg["base_url"]
        # Proxy optionnel : lu depuis la variable d'env indiquée dans le config
        proxy_env = self.cfg.get("proxy_env")
        self._proxy: str | None = os.environ.get(proxy_env) if proxy_env else None
        self._browser: Browser | None = None
        self._context: BrowserContext | None = None
        self._http: httpx.AsyncClient | None = None

    # ------------------------------------------------------------------ #
    #  Playwright context management                                       #
    # ------------------------------------------------------------------ #

    async def _get_context(self, pw) -> BrowserContext:
        if self._browser is None:
            self._browser = await pw.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage"],
                proxy={"server": self._proxy} if self._proxy else None,
            )
        if self._context is None:
            self._context = await self._browser.new_context(
                user_agent=random.choice(USER_AGENTS),
                locale="fr-FR",
                timezone_id="Africa/Casablanca",
            )
            await self._context.route(
                "**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,mp4}",
                lambda r: r.abort(),
            )
        return self._context

    def _get_http(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(
                headers={
                    "User-Agent": random.choice(USER_AGENTS),
                    "Accept": "text/html,application/xhtml+xml",
                    "Accept-Language": "fr-FR,fr;q=0.9",
                },
                follow_redirects=True,
                timeout=20,
                limits=httpx.Limits(max_connections=5, max_keepalive_connections=5),
                proxies=self._proxy if self._proxy else None,
            )
        return self._http

    async def _close(self):
        if self._context:
            await self._context.close()
            self._context = None
        if self._browser:
            await self._browser.close()
            self._browser = None
        if self._http:
            await self._http.aclose()
            self._http = None

    # ------------------------------------------------------------------ #
    #  Listing scrape (Playwright  JS-rendered)                          #
    # ------------------------------------------------------------------ #

    async def fetch_page(self, page: int = 1) -> list[AoData]:
        """
        Fetches ALL pages from the listing (not one page at a time).
        Pagination is handled internally via Playwright next-page clicks.
        Returns the full list of AoData found.

        The caller should pass page=1 always  this method manages pagination.
        """
        listing_cfg = self.cfg["listing"]
        listing_url = self.base_url + self.cfg["listing_path"]
        results: list[AoData] = []

        async with async_playwright() as pw:
            context = await self._get_context(pw)
            tab = await context.new_page()

            try:
                log.info("Loading listing page", source=self.source, url=listing_url)
                await tab.goto(listing_url, timeout=30000)

                # Certains paramètres URL (AllCons&searchAnnCons) déclenchent
                # la recherche automatiquement -- les résultats sont déjà là.
                results_sel = listing_cfg["results_ready_selector"]
                try:
                    await tab.wait_for_selector(results_sel, timeout=5000)
                    log.info("Results already loaded (auto-search)", source=self.source)
                except Exception:
                    # Résultats pas encore là : cliquer le bouton de recherche
                    await tab.wait_for_selector(listing_cfg["search_button"], timeout=15000)
                    await tab.click(listing_cfg["search_button"])
                    await tab.wait_for_selector(results_sel, timeout=30000)
                    log.info("Results loaded after search click", source=self.source)

                # Set 500 items per page
                nbelem_sel = listing_cfg.get("nbelem_select")
                if nbelem_sel:
                    try:
                        await tab.select_option(nbelem_sel, listing_cfg.get("nbelem_value", "500"))
                        await tab.wait_for_selector(listing_cfg["results_ready_selector"], timeout=60000)
                    except Exception as e:
                        log.warning("Could not set nbElem", error=str(e))
                        # Le select_option a pu perturber la navigation. On recharge
                        # l'URL et on réutilise la logique auto-detect.
                        try:
                            await tab.goto(listing_url, timeout=30000)
                            try:
                                await tab.wait_for_selector(results_sel, timeout=5000)
                            except Exception:
                                await tab.wait_for_selector(listing_cfg["search_button"], timeout=15000)
                                await tab.click(listing_cfg["search_button"])
                                await tab.wait_for_selector(results_sel, timeout=30000)
                            log.info("Results reloaded after nbElem failure", source=self.source)
                        except Exception as e2:
                            log.error("Could not reload after nbElem failure", error=str(e2))

                current_page = 1
                while True:
                    html = await tab.content()
                    page_results = self._parse_listing_html(html)
                    log.info("Page parsed", source=self.source, page=current_page, count=len(page_results))
                    results.extend(page_results)

                    # Stop if no results or stop condition: all IDs already known
                    if not page_results:
                        break

                    # Try next page
                    next_btn = listing_cfg.get("next_page_btn")
                    if not next_btn:
                        break
                    try:
                        btn = await tab.query_selector(next_btn)
                        if not btn:
                            log.info("No next page button, scrape complete", source=self.source)
                            break
                        # Check if button is disabled
                        disabled = await btn.get_attribute("disabled")
                        if disabled:
                            break
                        await btn.click()
                        delay = random.uniform(*self.cfg["delays"]["between_pages_s"])
                        await asyncio.sleep(delay)
                        await tab.wait_for_selector(listing_cfg["results_ready_selector"], timeout=20000)
                        current_page += 1
                    except Exception as e:
                        log.info("Pagination ended", source=self.source, reason=str(e))
                        break

            finally:
                await tab.close()
                await self._close()

        log.info("Listing scrape complete", source=self.source, total=len(results))
        return results

    def _parse_listing_html(self, html: str) -> list[AoData]:
        soup = BeautifulSoup(html, "html.parser")
        listing_cfg = self.cfg["listing"]
        cols = listing_cfg["cols"]
        rows = soup.select(listing_cfg["rows"])
        results = []

        for row in rows:
            try:
                # Detail link -> refConsultation + orgAcronyme
                link_el = row.select_one(cols["detail_link"])
                if not link_el:
                    continue
                href = link_el.get("href", "")
                ref_org = _extract_ref_org(href)
                if not ref_org:
                    continue
                ref_id, org = ref_org

                url_source = urljoin(self.base_url, href)

                def _sel(selector: str):
                    """select_one avec garde contre sélecteur vide."""
                    s = selector.strip()
                    return row.select_one(s) if s else None

                # Catégorie
                cat_el = _sel(cols.get("categorie", ""))
                categorie = cat_el.get_text(strip=True) if cat_el else None

                # Date limite
                dl_el = _sel(cols.get("date_limite", ""))
                date_limite = _parse_date(dl_el.get_text(strip=True)) if dl_el else None

                # Acheteur (truncated in listing)
                acheteur_el = _sel(cols.get("acheteur", ""))
                acheteur = acheteur_el.get_text(strip=True) if acheteur_el else None
                if acheteur:
                    acheteur = re.sub(r"^Acheteur public\s*:", "", acheteur).strip()

                # Titre / objet (truncated)
                titre_el = _sel(cols.get("titre", ""))
                titre = titre_el.get_text(strip=True) if titre_el else ""
                if titre:
                    titre = re.sub(r"^Objet\s*:", "", titre).strip()
                    titre = _collapse_duplicate_title(titre)

                # Lieu
                lieu_el = _sel(cols.get("lieu", ""))
                lieu = lieu_el.get_text(strip=True) if lieu_el else None
                if lieu:
                    lieu = _collapse_duplicate_title(lieu)

                # Date publication
                date_pub_el = _sel(cols.get("date_publication", ""))
                date_publication = _parse_date(date_pub_el.get_text(strip=True)) if date_pub_el else None

                results.append(AoData(
                    source=self.source,
                    external_id=ref_id,
                    url_source=url_source,
                    titre=titre or f"AO {ref_id}",
                    acheteur=acheteur,
                    date_publication=date_publication,
                    date_limite=date_limite,
                    categorie=categorie,
                    ville=lieu,
                ))
            except Exception as e:
                log.warning("Row parse error", error=str(e))
                continue

        return results

    # ------------------------------------------------------------------ #
    #  Detail page scrape (requests  server-rendered HTML)               #
    # ------------------------------------------------------------------ #

    async def fetch_detail(self, external_id: str, org: str) -> AoData | None:
        detail_cfg = self.cfg["detail"]
        path = self.cfg["detail_path"].format(ref_id=external_id, org=org)
        url = self.base_url + path

        try:
            resp = await self._get_http().get(url)
            resp.raise_for_status()
        except Exception as e:
            log.error("Detail fetch failed", url=url, error=str(e))
            return None

        soup = BeautifulSoup(resp.text, "html.parser")
        prefix = detail_cfg["summary_prefix"]
        fields = detail_cfg["fields"]

        def get_field(key: str) -> str:
            suffix = fields.get(key, "")
            el = soup.find(id=f"{prefix}{suffix}")
            return el.get_text(strip=True) if el else ""

        titre = _collapse_duplicate_title(get_field("titre"))
        acheteur = get_field("acheteur")
        date_limite_raw = get_field("date_limite")
        categorie = get_field("categorie")
        lieu_raw = get_field("lieu")
        lieu = _collapse_duplicate_title(lieu_raw) if lieu_raw else lieu_raw
        caution_raw = get_field("caution")
        secteur = get_field("secteur")
        mode_passation = get_field("procedure")
        reference = get_field("reference_human")

        # Budget  uses a dynamic repeater ID
        budget_el = soup.select_one(detail_cfg.get("budget_selector", ""))
        budget_raw = budget_el.get_text(strip=True) if budget_el else ""

        budget = _parse_amount(budget_raw)
        caution = _parse_amount(caution_raw)
        # AO alloti : la page de synthèse laisse estimation et caution vides,
        # elles sont publiées par lot sur une page à part. Constaté en
        # production le 2026-10-02 (email « Non publiée » sur un AO en deux
        # lots). On additionne les lots.
        lots_el = soup.find(id=f"{prefix}nbrLots")  # absent de la config : lu directement
        nb_lots = re.search(r"\d+", lots_el.get_text(strip=True) if lots_el else "")
        if nb_lots and int(nb_lots.group()) > 1 and (budget is None or caution is None):
            try:
                lots_url = (f"{self.base_url}/index.php?page=commun.PopUpDetailLots"
                            f"&orgAccronyme={org}&refConsultation={external_id}&lang=fr")
                lots = await self._get_http().get(lots_url)
                lots.raise_for_status()
                total_budget, total_caution = sommes_lots(lots.text)
                budget = budget if budget is not None else total_budget
                caution = caution if caution is not None else total_caution
            except Exception as e:
                log.warning("Detail des lots illisible", ref=external_id, error=str(e))

        # Date publication : essayer le champ config d'abord, puis recherche par ID
        date_pub_raw = get_field("date_publication")
        if not date_pub_raw:
            pub_el = soup.find(id=lambda x: x and "datePublication" in (x or ""))
            date_pub_raw = pub_el.get_text(strip=True) if pub_el else ""

        # ZIP download link
        zip_link_id = detail_cfg.get("zip_link_id", "")
        zip_el = soup.find(id=zip_link_id)
        zip_url = None
        if zip_el and zip_el.get("href"):
            zip_url = urljoin(self.base_url, zip_el["href"])

        return AoData(
            source=self.source,
            external_id=external_id,
            url_source=url,
            titre=titre or f"AO {external_id}",
            acheteur=acheteur or None,
            date_publication=_parse_date(date_pub_raw),
            date_limite=_parse_date(date_limite_raw),
            categorie=categorie or None,
            secteur=secteur or None,
            ville=lieu or None,
            budget_estime=budget,
            caution=caution,
            zip_url=zip_url,
            mode_passation=mode_passation or None,
            reference=reference or None,
        )

    # ------------------------------------------------------------------ #
    #  Document download (Playwright  formulaire de demande DCE)          #
    # ------------------------------------------------------------------ #

    async def download_document(
        self,
        zip_url: str,
        on_step: Callable[[str], None] | None = None,
    ) -> tuple[bytes, str] | None:
        """
        Sur les portails MPE, le lien "Telecharger" du DCE ne pointe jamais
        vers un fichier direct : il mene a un formulaire de demande
        (EntrepriseDemandeTelechargementDce) qui exige nom/prenom/email avant
        de faire apparaitre le vrai bouton de telechargement. Confirme en
        conditions reelles (raisonSocial/ICE non obligatoires, formulaire
        rempli avec Nom="Adjuja", Prenom="Adjuja", Email="contact@adjuja.com"
        -> soumission acceptee -> zip complet recupere).

        `on_step` recoit le nom de chaque etape au moment ou elle commence, pour
        l'affichage de la progression (voir app/core/download_progress.py)."""

        def step(name: str) -> None:
            if on_step:
                on_step(name)

        # Avant le demarrage de Playwright, qui prend lui-meme plusieurs secondes :
        # sinon l'ecran affiche encore « en attente » pendant ce temps.
        step("ouverture_portail")
        async with async_playwright() as pw:
            context = await self._get_context(pw)
            page = await context.new_page()
            try:
                await page.goto(zip_url, timeout=30000)

                nom_input = page.locator("input[id$='EntrepriseFormulaireDemande_nom']")
                if await nom_input.count():
                    step("formulaire")
                    await nom_input.fill("Adjuja")
                    await page.locator("input[id$='EntrepriseFormulaireDemande_prenom']").fill("Adjuja")
                    await page.locator("input[id$='EntrepriseFormulaireDemande_email']").fill("contact@adjuja.com")
                    await page.locator("input[id$='EntrepriseFormulaireDemande_accepterConditions']").check()
                    await page.locator("input[id$='_validateButton']").click()

                # On attend le bouton de telechargement lui-meme, pas le repos du reseau.
                # L'ancien wait_for_load_state("networkidle", timeout=15000) expirait
                # des que le portail gardait une requete en arriere-plan, et l'exception
                # faisait echouer tout le telechargement alors que le bouton etait la ou
                # allait l'etre (3 echecs sur 4 tentatives sur l'AO 599, 2026-09-13).
                # "attached" reprend la semantique de l'ancien count() : present dans le DOM.
                step("preparation_dossier")
                dl_btn = page.locator("a[id$='EntrepriseDownloadDce_completeDownload']")
                try:
                    await dl_btn.first.wait_for(state="attached", timeout=45000)
                except Exception:
                    log.warning(
                        "Download button did not appear after DCE form flow",
                        url=zip_url, waited_ms=45000,
                    )
                    return None

                step("reception_fichier")
                async with page.expect_download(timeout=30000) as dl_info:
                    await dl_btn.click()
                download = await dl_info.value
                path = await download.path()
                if not path:
                    return None
                return Path(path).read_bytes(), download.suggested_filename
            except Exception as e:
                log.error("download_document failed", url=zip_url, error=str(e))
                return None
            finally:
                await page.close()
                await self._close()

    # ------------------------------------------------------------------ #
    #  Health check                                                        #
    # ------------------------------------------------------------------ #

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(self.base_url)
                return resp.status_code < 500
        except Exception:
            return False
