"""Collecte des résultats publiés (lot A). Spec :
context/feature-spec/resultats-attribution/api.md.

- BDC : pages GET `?page=N`, du plus récent au plus ancien.
- AO : listing des annonces filtré par type (4 résultat définitif, 5 extrait de
  PV), même tableau que les consultations ; puis, fiche par fiche, le lien de
  la pièce jointe. Le scraper des consultations (`ao_scraper/mpe.py`) n'est
  pas modifié : on en hérite seulement le chargement de config, Playwright et
  httpx.
"""

import asyncio
import random
import re
from collections.abc import Awaitable, Callable
from urllib.parse import urljoin

import httpx
import structlog
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

from app.modules.ao_scraper.mpe import MPEPlatformScraper, _collapse_duplicate_title, _extract_ref_org
from app.modules.award_scraper.parsing import (
    ResultatPublie,
    liens_pieces_jointes,
    lire_cartes_bdc,
    lire_date_heure,
)

log = structlog.get_logger(__name__)

BDC_URL = "https://www.marchespublics.gov.ma/bdc/entreprise/consultation/resultat"
TYPES_ANNONCE = {"resultat_definitif": "4", "extrait_pv": "5"}


async def _contenu(tab) -> str:
    """HTML de la page, en laissant finir une navigation encore en cours."""
    for essai in range(4):
        try:
            await tab.wait_for_load_state("load", timeout=60000)
            return await tab.content()
        except Exception as exc:
            if "navigating" not in str(exc) or essai == 3:
                raise
            await asyncio.sleep(2)
    return ""


class BdcResultScraper:
    source = "marchespublics_bdc"

    def __init__(self) -> None:
        self._http = httpx.AsyncClient(
            headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64)"}, timeout=30, follow_redirects=True)

    async def page(self, n: int) -> list[ResultatPublie]:
        r = await self._http.get(BDC_URL, params={"page": n})
        r.raise_for_status()
        return lire_cartes_bdc(r.text, f"{BDC_URL}?page={n}")

    async def close(self) -> None:
        await self._http.aclose()


class MPEAwardScraper(MPEPlatformScraper):
    """Annonces de résultat d'un portail MPE. Config : bloc
    `listing_attribution` du *.config.json ; absent ou null = pas de résultats."""

    def __init__(self, config_name: str):
        super().__init__(config_name)
        self.acfg = self.cfg.get("listing_attribution")

    def _lire_lignes(self, html: str, type_resultat: str) -> list[ResultatPublie]:
        cols = self.acfg["cols"]
        sortie = []
        for row in BeautifulSoup(html, "html.parser").select(self.acfg["rows"]):
            lien = row.select_one(cols["detail_link"])
            ref_org = _extract_ref_org(lien.get("href", "")) if lien else None
            if not ref_org:
                continue
            ref_id, org = ref_org

            def texte(cle: str, motif: str = "") -> str | None:
                el = row.select_one(cols[cle]) if cols.get(cle) else None
                if not el:
                    return None
                t = el.get_text(" ", strip=True)
                return re.sub(motif, "", t).strip() if motif else t

            objet = texte("titre", r"^Objet\s*:")
            sortie.append(ResultatPublie(
                source=self.source, type_resultat=type_resultat, cle_externe=ref_id,
                objet=_collapse_duplicate_title(objet) if objet else f"Annonce {ref_id}",
                url_source=urljoin(self.base_url, lien["href"]), org_acronyme=org,
                reference=texte("reference"), acheteur=texte("acheteur", r"^Acheteur public\s*:"),
                procedure=texte("procedure"), categorie=texte("categorie"),
                lieu_execution=texte("lieu"), date_publication=lire_date_heure(texte("date_publication")),
            ))
        return sortie

    async def annonces(
        self, type_resultat: str, arreter: Callable[[list[ResultatPublie], int], Awaitable[bool]],
    ) -> list[ResultatPublie]:
        """Les annonces du type, page après page, jusqu'à ce que
        `arreter(page, numero)` soit vrai. La liste n'est PAS triée par date
        de publication (vérifié le 2026-10-01 : une page couvre deux semaines
        mélangées) : l'arrêt se fait sur des annonces déjà connues, pas sur
        une date."""
        a, listing = self.acfg, self.cfg["listing"]
        resultats: list[ResultatPublie] = []
        async with async_playwright() as pw:
            tab = await (await self._get_context(pw)).new_page()
            try:
                await tab.goto(self.base_url + a["path"], timeout=60000)
                await tab.select_option(a["annonce_type_select"], TYPES_ANNONCE[type_resultat])
                # Chaque action du formulaire (recherche, taille de page, page
                # suivante) recharge la page côté serveur (postback ASP.NET) :
                # lire le contenu avant la fin du rechargement échouait
                # (« page is navigating », essai réel du 2026-10-01).
                async with tab.expect_navigation(timeout=90000):
                    await tab.click(listing["search_button"])
                if a.get("no_result_text") and a["no_result_text"] in await _contenu(tab):
                    return []
                try:
                    async with tab.expect_navigation(timeout=90000):
                        await tab.select_option(listing["nbelem_select"], listing.get("nbelem_value", "500"))
                except Exception as exc:
                    log.warning("Taille de page non changée", source=self.source, error=str(exc)[:120])
                for numero in range(1, a.get("max_pages", 40) + 1):
                    page = self._lire_lignes(await _contenu(tab), type_resultat)
                    resultats.extend(page)
                    log.info("Page de résultats lue", source=self.source, type=type_resultat, page=numero, lignes=len(page))
                    if not page or await arreter(page, numero):
                        break
                    bouton = await tab.query_selector(listing["next_page_btn"])
                    if not bouton or await bouton.get_attribute("disabled"):
                        break
                    await asyncio.sleep(random.uniform(*self.cfg["delays"]["between_pages_s"]))
                    async with tab.expect_navigation(timeout=90000):
                        await bouton.click()
            finally:
                await tab.close()
                await self._close()
        return resultats

    async def pieces_jointes(self, url_fiche: str) -> list[dict]:
        r = await self._get_http().get(url_fiche)
        r.raise_for_status()
        return liens_pieces_jointes(r.text, self.base_url)
