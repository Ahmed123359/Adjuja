"""Sonde en lecture seule (2026-10-01) : jusqu'où remonte l'historique des
résultats publiés ? Voir context/feature-spec/suivi-resultats/ (phase 2).

Usage (conteneur ao-watcher) : python probe/profondeur_resultats.py
"""

import asyncio
import re

import httpx
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

BDC = "https://www.marchespublics.gov.ma/bdc/entreprise/consultation/resultat"
AO = "https://www.marchespublics.gov.ma/index.php?page=entreprise.EntrepriseAdvancedSearch&AllAnn"


def bdc_dates(page: int) -> list[str]:
    r = httpx.get(BDC, params={"page": page}, timeout=30, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0"})
    return re.findall(r"\d{2}/\d{2}/\d{4} \d{2}:\d{2}", BeautifulSoup(r.text, "html.parser").get_text(" "))


async def ao(type_annonce: str, debut: str, fin: str) -> None:
    async with async_playwright() as pw:
        nav = await pw.chromium.launch(headless=True, args=["--no-sandbox"])
        tab = await nav.new_page()
        await tab.goto(AO, timeout=60000)
        await tab.select_option("#ctl0_CONTENU_PAGE_AdvancedSearch_annonceType", type_annonce)
        await tab.fill("#ctl0_CONTENU_PAGE_AdvancedSearch_dateMiseEnLigneCalculeStart", debut)
        await tab.fill("#ctl0_CONTENU_PAGE_AdvancedSearch_dateMiseEnLigneCalculeEnd", fin)
        await tab.click("#ctl0_CONTENU_PAGE_AdvancedSearch_lancerRecherche")
        await tab.wait_for_load_state("networkidle", timeout=90000)
        texte = await tab.inner_text("body")
        total = re.search(r"Nombre de r[ée]sultats\s*:?\s*(\d[\d\s]*)", texte, re.I)
        aucun = "Aucun résultat" in texte
        dates = re.findall(r"\d{2}/\d{2}/\d{4}", texte)
        print(f"AO type {type_annonce} {debut}-{fin} : total={total.group(1).strip() if total else ('0' if aucun else '?')}",
              f"dates : {dates[:2]} ... {dates[-2:]}")
        await nav.close()


async def main() -> None:
    for p in (31500,):
        d = bdc_dates(p)
        print(f"BDC page {p} : {d[:1]} ... {d[-1:]}")
    for annee in ("2023", "2024", "2025"):
        await ao("4", f"01/01/{annee}", f"31/01/{annee}")
    await ao("5", "01/01/2024", "31/01/2024")


asyncio.run(main())
