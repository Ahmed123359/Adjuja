import re
from datetime import date, datetime
from urllib.parse import urljoin

import httpx
import structlog
from bs4 import BeautifulSoup, Tag

from app.modules.bdc_scraper.base import BdcData, IBdcScraper

log = structlog.get_logger(__name__)

BASE_URL = "https://www.marchespublics.gov.ma"
LISTING_PATH = "/bdc/entreprise/consultation/"
DETAIL_PATH = "/bdc/entreprise/consultation/show/{id}"

_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
)

_REF_ID_RE = re.compile(r"/show/(\d+)")


def _parse_date_fr(raw: str | None) -> date | None:
    """Formats observes : 'DD/MM/YYYY' ou 'DD/MM/YYYY HH:MM'."""
    if not raw:
        return None
    raw = raw.strip().split(" ")[0]
    try:
        return datetime.strptime(raw, "%d/%m/%Y").date()
    except ValueError:
        return None


def _strip_label(text: str, label_pattern: str) -> str:
    return re.sub(rf"^{label_pattern}\s*:?\s*", "", text, flags=re.I).strip()


class BdcScraper(IBdcScraper):
    """Scraper pour les Bons de Commande de marchespublics.gov.ma.

    Contrairement aux AOs (ASP.NET WebForms, pagination postback -> Playwright
    obligatoire), le module BDC est une appli Symfony classique : pagination
    par ?page=N en GET simple, HTML server-rendu sans JS necessaire. Un simple
    httpx + BeautifulSoup suffit, pas de Playwright.

    Selecteurs verifies contre le HTML reel (2026-06-28), pas des estimations :
    cartes listing = div.entreprise__card, champs detail ancres par id d'icone
    stable (#building, #dateMiseEnLigne, #calendar, #location, #category,
    #screwdriver).
    """

    source = "marchespublics_bdc"

    def __init__(self) -> None:
        self._client: httpx.AsyncClient | None = None

    def _get_http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                headers={"User-Agent": _USER_AGENT},
                timeout=30,
                follow_redirects=True,
            )
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def health_check(self) -> bool:
        try:
            resp = await self._get_http().get(urljoin(BASE_URL, LISTING_PATH))
            return resp.status_code == 200
        except Exception:
            return False

    async def fetch_page(self, page: int = 1) -> list[BdcData]:
        url = urljoin(BASE_URL, LISTING_PATH)
        resp = await self._get_http().get(url, params={"page": page})
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        results: list[BdcData] = []
        for card in soup.select("div.entreprise__card"):
            data = self._parse_card(card)
            if data:
                results.append(data)
        return results

    def _parse_card(self, card: Tag) -> BdcData | None:
        links = card.select(".entreprise__middleSubCard a")
        if len(links) < 3:
            return None
        ref_el, objet_el, acheteur_el = links[0], links[1], links[2]

        href = ref_el.get("href", "")
        match = _REF_ID_RE.search(href)
        if not match:
            return None
        external_id = match.group(1)

        titre = _strip_label(objet_el.get_text(strip=True), "Objet")
        acheteur = _strip_label(acheteur_el.get_text(strip=True), "Acheteur") or None
        est_annule = card.select_one("span.badge.bg-danger") is not None

        right = card.select_one(".entreprise__rightSubCard")
        date_limite = None
        ville = None
        if right:
            spans = right.find_all("span")
            # Ordre verifie : [0] label date, [1] date, [2] heure, [3] label lieu, [4] lieu
            if len(spans) >= 2:
                date_limite = _parse_date_fr(spans[1].get_text(strip=True))
            if len(spans) >= 5:
                lieu_span = spans[4]
                ville = (lieu_span.get("data-bs-title") or lieu_span.get_text(strip=True) or "").strip() or None

        return BdcData(
            source=self.source,
            external_id=external_id,
            url_source=urljoin(BASE_URL, href),
            titre=titre or f"BDC {external_id}",
            acheteur=acheteur,
            date_limite=date_limite,
            ville=ville,
            est_annule=est_annule,
        )

    async def fetch_detail(self, external_id: str) -> BdcData | None:
        url = urljoin(BASE_URL, DETAIL_PATH.format(id=external_id))
        try:
            resp = await self._get_http().get(url)
            resp.raise_for_status()
        except Exception as e:
            log.error("BDC detail fetch failed", external_id=external_id, error=str(e))
            return None

        soup = BeautifulSoup(resp.text, "html.parser")

        def field_by_icon(icon_id: str) -> str | None:
            icon = soup.find(id=icon_id)
            if not icon:
                return None
            container = icon.find_parent("div", class_="col-lg-3") or icon.find_parent("div")
            if not container:
                return None
            value_spans = container.select("div.d-flex.flex-column span")
            if not value_spans:
                return None
            value_el = value_spans[-1]
            return (value_el.get("data-bs-title") or value_el.get_text(strip=True) or "").strip() or None

        objet_heading = soup.find("span", class_="text-uppercase", string=re.compile(r"^\s*Objet\s*$", re.I))
        titre = None
        if objet_heading:
            block = objet_heading.find_parent("div")
            titre_el = block.select_one("span.text-black") if block else None
            titre = titre_el.get_text(strip=True) if titre_el else None

        acheteur = field_by_icon("building")
        date_mise_en_ligne = _parse_date_fr(field_by_icon("dateMiseEnLigne"))
        date_limite = _parse_date_fr(field_by_icon("calendar"))
        ville = field_by_icon("location")
        categorie = field_by_icon("category")
        nature_prestation = field_by_icon("screwdriver")

        est_annule = soup.select_one("span.badge.bg-danger") is not None
        date_annulation: date | None = None
        raison_annulation: str | None = None
        if est_annule:
            annul_heading = soup.find("span", class_="text-uppercase", string=re.compile(r"annulation", re.I))
            if annul_heading:
                annul_block = annul_heading.find_parent("div", class_=re.compile("border"))
                if annul_block:
                    values = annul_block.select("div.col-xl-10 span")
                    if len(values) >= 1:
                        date_annulation = _parse_date_fr(values[0].get_text(strip=True))
                    if len(values) >= 2:
                        raison_annulation = values[1].get_text(strip=True) or None

        document_url = None
        document_nom = None
        doc_heading = soup.find("span", class_="text-uppercase", string=re.compile(r"Pi[eè]ces jointes", re.I))
        if doc_heading:
            doc_block = doc_heading.find_parent("div")
            doc_link = doc_block.select_one("a.nounderlinelink") if doc_block else None
            if doc_link:
                document_url = urljoin(BASE_URL, doc_link.get("href", ""))
                document_nom = doc_link.get_text(strip=True) or None

        return BdcData(
            source=self.source,
            external_id=external_id,
            url_source=url,
            titre=titre or f"BDC {external_id}",
            acheteur=acheteur,
            date_publication=date_mise_en_ligne,
            date_limite=date_limite,
            categorie=categorie,
            nature_prestation=nature_prestation,
            ville=ville,
            est_annule=est_annule,
            date_annulation=date_annulation,
            raison_annulation=raison_annulation,
            document_url=document_url,
            document_nom=document_nom,
        )
