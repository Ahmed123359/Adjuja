"""
Re-analyse une fois les AO encore ouverts dont l'analyse date d'avant
l'analyse enrichie (pas de cle `risques`). Spec :
context/feature-spec/analyse-ao-enrichie/api.md, section 4.

Les cinq nouvelles cles (risques, budget, clauses, questions, jalons) sont
AJOUTEES a l'analyse existante, jamais a sa place (fusionner_enrichissement).

Par defaut : simulation (compte les AO, n'appelle pas le modele).

Usage (dans le conteneur ao-watcher-api) :
  python enrichir_analyses.py              # simulation
  python enrichir_analyses.py --reel       # appels reels, un AO a la fois
  python enrichir_analyses.py --reel --limite 5 --pause 5

Lancer AVANT le script du backend (app/scripts/enrichir_analyses.py), qui
recopie ces analyses dans les AO importes.
"""

import argparse
import asyncio
from datetime import date

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.models import ScrapedAo
from app.modules.ao_scraper.analysis import AnalysisError, analyze_ao
from app.modules.ao_scraper.enrichissement import a_enrichir, fusionner_enrichissement

# Ordre de grandeur d'une analyse : jusqu'a 100 000 caracteres de CPS + RC
# (~25 000 jetons en entree) et ~3 000 jetons en sortie.
JETONS_ENTREE, JETONS_SORTIE = 25_000, 3_000


async def main(reel: bool, limite: int | None, pause: float) -> None:
    engine = create_async_engine(settings.database_url)
    Session = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with Session() as session:
        candidats = (await session.execute(
            select(ScrapedAo)
            .where(ScrapedAo.analyse_json.isnot(None))
            .where(or_(ScrapedAo.date_limite.is_(None), ScrapedAo.date_limite >= date.today()))
            .order_by(ScrapedAo.date_limite.asc().nulls_last())
        )).scalars().all()
    a_faire = [ao for ao in candidats if a_enrichir(ao.analyse_json)]
    if limite:
        a_faire = a_faire[:limite]

    print(f"AO ouverts deja analyses : {len(candidats)} ; a enrichir : {len(a_faire)}")
    print(f"Estimation : au plus {len(a_faire)} appels, ~{len(a_faire) * JETONS_ENTREE:,} jetons "
          f"en entree et ~{len(a_faire) * JETONS_SORTIE:,} en sortie (modele {settings.llm_analysis}).")
    if not reel:
        print("Simulation : rien n'a ete appele ni modifie. Relancer avec --reel.")
        await engine.dispose()
        return

    faits, echecs = 0, []
    for i, ao in enumerate(a_faire, start=1):
        try:
            nouvelle = await analyze_ao(ao)
        except AnalysisError as exc:  # OcrRequise comprise : documents scannes non lus
            echecs.append((ao.id, str(exc)[:120]))
            print(f"[{i}/{len(a_faire)}] AO {ao.id} : ignore ({type(exc).__name__})")
            continue
        fusion = fusionner_enrichissement(ao.analyse_json, nouvelle)
        async with Session() as session:
            await session.execute(update(ScrapedAo).where(ScrapedAo.id == ao.id).values(analyse_json=fusion))
            await session.commit()
        faits += 1
        print(f"[{i}/{len(a_faire)}] AO {ao.id} : {len(fusion.get('risques') or [])} risque(s)")
        if i < len(a_faire):
            await asyncio.sleep(pause)  # limite de debit du fournisseur

    await engine.dispose()
    print(f"Termine : {faits} AO enrichis, {len(echecs)} ignores.")
    for ao_id, raison in echecs:
        print(f"  - AO {ao_id} : {raison}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reel", action="store_true", help="appeler vraiment le modele et enregistrer")
    parser.add_argument("--limite", type=int, default=None, help="nombre maximum d'AO a traiter")
    parser.add_argument("--pause", type=float, default=3.0, help="secondes entre deux appels")
    args = parser.parse_args()
    asyncio.run(main(args.reel, args.limite, args.pause))
