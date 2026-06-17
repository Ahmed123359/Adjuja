"""
Selector probe for marchespublics.gov.ma.
Run once to confirm real CSS selectors.

Usage (host, si playwright installé) :
  cd ao-watcher
  python probe/selector_probe.py

Usage (Docker — recommande) :
  docker compose -f docker-compose.dev.yml run --rm ao-watcher-api python probe/selector_probe.py

Résultats attendus :
  - Detail links found: > 0
  - Row structure: affiche les colonnes (action, catégorie, date, acheteur, objet, lieu)
  - nbElem select avec option "500"
  - Pager links si > 1 page
  - HTML sauvegardé dans /tmp/marchespublics_listing_js.html pour inspection manuelle
"""

import asyncio
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

BASE = "https://www.marchespublics.gov.ma"
LISTING_URL = f"{BASE}/index.php?page=entreprise.EntrepriseAdvancedSearch&AllCons&EnCours&searchAnnCons"

SEARCH_BTN = "#ctl0_CONTENU_PAGE_AdvancedSearch_lancerRecherche"
RESULTS_SELECTOR = "a[href*='EntrepriseDetailConsultation']"


async def probe_listing():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
            locale="fr-FR",
            timezone_id="Africa/Casablanca",
        )
        page = await context.new_page()

        # Block images/fonts for speed
        await context.route("**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf}", lambda r: r.abort())

        print(f"Loading listing page...")
        await page.goto(LISTING_URL, timeout=30000)
        await page.wait_for_selector(SEARCH_BTN, timeout=15000)
        print("Search form loaded. Clicking 'Lancer la recherche'...")
        await page.click(SEARCH_BTN)

        print("Waiting for results...")
        await page.wait_for_selector(RESULTS_SELECTOR, timeout=30000)
        print("Results appeared!")

        html = await page.content()
        soup = BeautifulSoup(html, "html.parser")

        # --- Find results table ---
        detail_links = soup.find_all("a", href=lambda h: h and "EntrepriseDetailConsultation" in h)
        print(f"\nDetail links found: {len(detail_links)}")
        if detail_links:
            print(f"First href: {detail_links[0]['href']!r}")

        # Find the table containing detail links
        first_link = detail_links[0] if detail_links else None
        if first_link:
            row = first_link.find_parent("tr")
            if row:
                tds = row.find_all("td")
                print(f"\nRow structure ({len(tds)} columns):")
                for i, td in enumerate(tds):
                    print(f"  td[{i}] class={td.get('class')} text={td.get_text(strip=True)[:60]!r}")
                table = row.find_parent("table")
                if table:
                    print(f"\nTable: id={table.get('id')!r} class={table.get('class')}")
                    thead = table.find("thead") or table.find("tr")
                    if thead:
                        headers = thead.find_all(["th", "td"])
                        print(f"Headers: {[h.get_text(strip=True)[:30] for h in headers]}")

        # --- Pagination ---
        pager = soup.find(id=lambda x: x and "Pager" in (x or ""))
        if pager:
            print(f"\nPager found: id={pager.get('id')} tag={pager.name}")
        pager_links = soup.find_all("a", id=lambda x: x and "Pager" in (x or ""))
        print(f"Pager links: {len(pager_links)}")
        for pl in pager_links[:5]:
            print(f"  id={pl.get('id')} href={pl.get('href')!r} text={pl.get_text(strip=True)!r}")

        # --- Results count ---
        for tag in soup.find_all(string=lambda t: t and "résultat" in t.lower() and len(t.strip()) < 80):
            print(f"Results count text: {tag.strip()!r}")

        # --- nbElem selector ---
        selects = soup.find_all("select")
        for s in selects:
            options = [o.get("value") for o in s.find_all("option")]
            if "500" in options or "100" in options:
                print(f"\nnbElem select: id={s.get('id')!r} name={s.get('name')!r} options={options}")

        # Save full HTML
        with open("/tmp/marchespublics_listing_js.html", "w") as f:
            f.write(html)
        print("\nFull JS-rendered HTML saved to /tmp/marchespublics_listing_js.html")

        await browser.close()


if __name__ == "__main__":
    asyncio.run(probe_listing())
