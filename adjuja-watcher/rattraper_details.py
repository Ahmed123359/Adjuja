"""
Rattrape l'estimation, la caution, le secteur et la reference des AO encore ouverts.

Jusqu'au 2026-09-29, chaque re-scrape de liste (toutes les 6 h) effacait ces
champs, lus une seule fois sur la page detail a la decouverte de l'AO (bug
corrige dans repository.upsert_many). Les codes de secteur, recalcules sans le
secteur, s'appauvrissaient aussi : l'AO ne correspondait plus aux preferences
des organisations et n'etait jamais notifie.

Ce script relit la page detail des AO ouverts (date limite non passee) a qui il
manque l'un de ces champs, les restaure et recalcule les codes de secteur. Il
ne remplace jamais une valeur existante par une valeur vide.

Depuis le 2026-09-30, il remplit aussi la reference de l'avis (colonne
`reference`, jusque-la jamais enregistree) des AO ouverts qui n'en ont pas.

Par defaut : simulation (compte, ne lit ni n'ecrit rien).

Usage (dans le conteneur ao-watcher-api) :
  python rattraper_details.py              # simulation
  python rattraper_details.py --reel       # lit les pages et enregistre
  python rattraper_details.py --reel --limite 50 --pause 1.5
"""

import argparse
import asyncio
from datetime import date
from urllib.parse import parse_qs, urlparse

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.models import ScrapedAo
from app.core.schema import assurer_colonnes
from app.modules.ao_scraper.matching import match_secteurs
from app.modules.ao_scraper.mpe import MPEPlatformScraper

SOURCES = ("marchespublics", "safakat_cdg", "achats_cimr")


def _org(url: str) -> str:
    return parse_qs(urlparse(url).query).get("orgAcronyme", [""])[0]


async def main(reel: bool, limite: int | None, pause: float, sources: tuple[str, ...]) -> None:
    await assurer_colonnes()
    engine = create_async_engine(settings.database_url)
    Session = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with Session() as session:
        aos = (await session.execute(
            select(ScrapedAo.id, ScrapedAo.source, ScrapedAo.external_id, ScrapedAo.url_source,
                   ScrapedAo.titre, ScrapedAo.description, ScrapedAo.secteur)
            .where(ScrapedAo.source.in_(sources))
            .where(ScrapedAo.date_limite >= date.today())
            .where(or_(ScrapedAo.budget_estime.is_(None), ScrapedAo.caution.is_(None), ScrapedAo.secteur.is_(None),
                       ScrapedAo.reference.is_(None)))
            .order_by(ScrapedAo.date_limite.asc())
        )).all()
    if limite:
        aos = aos[:limite]

    par_source: dict[str, int] = {}
    for ao in aos:
        par_source[ao.source] = par_source.get(ao.source, 0) + 1
    print(f"AO ouverts a completer : {len(aos)} {par_source}")
    print(f"Duree estimee : ~{int(len(aos) * (pause + 1.5) / 60) + 1} min (une page a la fois, pause {pause} s).")
    if not reel:
        print("Simulation : aucune page lue, rien d'enregistre. Relancer avec --reel.")
        await engine.dispose()
        return

    scrapers = {s: MPEPlatformScraper(s) for s in {ao.source for ao in aos}}
    completes, sans_page, inchanges = 0, 0, 0
    try:
        for i, ao in enumerate(aos, start=1):
            detail = await scrapers[ao.source].fetch_detail(ao.external_id, _org(ao.url_source))
            if not detail:
                sans_page += 1
                continue
            valeurs = {}
            if detail.budget_estime is not None:
                valeurs["budget_estime"] = detail.budget_estime
            if detail.caution is not None:
                valeurs["caution"] = detail.caution
            secteur = detail.secteur or ao.secteur
            if detail.secteur:
                valeurs["secteur"] = detail.secteur
            if detail.mode_passation:
                valeurs["mode_passation"] = detail.mode_passation
            if detail.reference:
                valeurs["reference"] = detail.reference
            valeurs["secteur_codes"] = match_secteurs(ao.titre, secteur, ao.description)
            # Le portail ne publie parfois ni estimation ni caution : rien a restaurer.
            if detail.budget_estime is None and detail.caution is None:
                inchanges += 1
            async with Session() as session:
                await session.execute(update(ScrapedAo).where(ScrapedAo.id == ao.id).values(**valeurs))
                await session.commit()
            completes += 1
            if i % 25 == 0:
                print(f"  {i}/{len(aos)}")
            await asyncio.sleep(pause)
    finally:
        for s in scrapers.values():
            await s._close()
        await engine.dispose()

    print(f"Termine : {completes} AO mis a jour, {sans_page} pages illisibles, {inchanges} sans estimation ni caution publiees.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reel", action="store_true", help="lire les pages et enregistrer")
    parser.add_argument("--limite", type=int, default=None, help="nombre maximum d'AO")
    parser.add_argument("--pause", type=float, default=1.5, help="secondes entre deux pages")
    parser.add_argument("--source", choices=SOURCES, default=None, help="une seule source")
    args = parser.parse_args()
    asyncio.run(main(args.reel, args.limite, args.pause, (args.source,) if args.source else SOURCES))
