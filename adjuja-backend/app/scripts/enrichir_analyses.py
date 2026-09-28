"""Enrichit une fois l'analyse des AO encore ouverts (analyse enrichie).

Spec : context/feature-spec/analyse-ao-enrichie/api.md, section 4.

- AO importe de la veille (reference `watcher-<id>`) : recopie les nouvelles
  cles depuis watcher.scraped_aos, deja re-analyse par le script du watcher
  (adjuja-watcher/enrichir_analyses.py, a lancer AVANT celui-ci). Aucun appel
  au modele. Les deux services partagent la meme base PostgreSQL (schema
  `watcher`), d'ou la lecture SQL directe, acceptable pour un script ponctuel.
- AO televerse a la main : nouvel appel au modele (analyser_documents_ao), sans
  toucher au statut, a l'avancement ni au parcours du mode accompagne.

Dans les deux cas, les cinq nouvelles cles sont AJOUTEES, jamais a la place de
l'existant : l'utilisateur a pu corriger l'analyse en mode accompagne.

Par defaut : simulation. Usage (dans le conteneur api) :
  python -m app.scripts.enrichir_analyses
  python -m app.scripts.enrichir_analyses --reel [--pause 3]
"""

import argparse
import asyncio
from datetime import date, datetime

from sqlalchemy import select, text

from app.db.base import AsyncSessionLocal, engine
from app.db.models import AppelOffre
from app.services.analyse_enrichissement import a_enrichir, fusionner_enrichissement
from app.tasks.ao_tasks import analyser_documents_ao

PREFIXE_VEILLE = "watcher-"


def _date(valeur: str | None) -> date | None:
    """Date limite d'un AO, stockee en texte sous plusieurs formes."""
    if not valeur:
        return None
    debut = valeur.strip()[:10]  # « 2026-10-12T09:00 » -> « 2026-10-12 »
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(debut, fmt).date()
        except ValueError:
            continue
    return None


def est_ouvert(ao: AppelOffre) -> bool:
    """Ouvert = pas abandonne, et date limite non passee ou inconnue."""
    if ao.statut == "abandonne":
        return False
    contexte = (ao.analyse_json or {}).get("contexte") or {}
    limite = _date(ao.date_limite) or _date(contexte.get("date_limite") if isinstance(contexte, dict) else None)
    return limite is None or limite >= date.today()


async def _analyse_veille(session, reference: str) -> dict | None:
    try:
        scraped_id = int(reference[len(PREFIXE_VEILLE):])
    except ValueError:
        return None
    ligne = (await session.execute(
        text("SELECT analyse_json FROM watcher.scraped_aos WHERE id = :id"), {"id": scraped_id}
    )).first()
    return ligne[0] if ligne else None


async def main(reel: bool, pause: float) -> None:
    async with AsyncSessionLocal() as session:
        aos = (await session.execute(
            select(AppelOffre).where(AppelOffre.analyse_json.isnot(None))
        )).scalars().all()
    a_faire = [ao for ao in aos if est_ouvert(ao) and a_enrichir(ao.analyse_json)]
    importes = [ao for ao in a_faire if (ao.reference or "").startswith(PREFIXE_VEILLE)]
    manuels = [ao for ao in a_faire if ao not in importes]

    print(f"AO ouverts a enrichir : {len(a_faire)} "
          f"({len(importes)} importes de la veille, sans appel ; {len(manuels)} televerses, un appel chacun)")
    if not reel:
        print("Simulation : rien n'a ete appele ni modifie. Relancer avec --reel.")
        await engine.dispose()
        return

    faits, ignores = 0, []
    for ao in importes:
        async with AsyncSessionLocal() as session:
            veille = await _analyse_veille(session, ao.reference)
            if not veille or a_enrichir(veille):
                ignores.append((ao.id, "analyse de veille pas encore enrichie : lancer d'abord le script du watcher"))
                continue
            fresh = await session.get(AppelOffre, ao.id)
            fresh.analyse_json = fusionner_enrichissement(fresh.analyse_json or {}, veille)
            await session.commit()
            faits += 1

    for i, ao in enumerate(manuels, start=1):
        try:
            nouvelle = await analyser_documents_ao(ao.id)
        except Exception as exc:  # cle refusee, documents absents, OCR impossible
            ignores.append((ao.id, f"{type(exc).__name__}: {str(exc)[:100]}"))
            continue
        async with AsyncSessionLocal() as session:
            fresh = await session.get(AppelOffre, ao.id)
            fresh.analyse_json = fusionner_enrichissement(fresh.analyse_json or {}, nouvelle)
            await session.commit()
        faits += 1
        print(f"[{i}/{len(manuels)}] AO {ao.id} : {len(nouvelle.get('risques') or [])} risque(s)")
        if i < len(manuels):
            await asyncio.sleep(pause)

    await engine.dispose()
    print(f"Termine : {faits} AO enrichis, {len(ignores)} ignores.")
    for ao_id, raison in ignores:
        print(f"  - AO {ao_id} : {raison}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reel", action="store_true", help="appeler vraiment le modele et enregistrer")
    parser.add_argument("--pause", type=float, default=3.0, help="secondes entre deux appels au modele")
    args = parser.parse_args()
    asyncio.run(main(args.reel, args.pause))
