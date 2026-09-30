"""
Re-analyse une fois les AO encore ouverts dont l'analyse date d'avant
l'analyse enrichie (pas de cle `risques`). Spec :
context/feature-spec/analyse-ao-enrichie/api.md, section 4.

Les cinq nouvelles cles (risques, budget, clauses, questions, jalons) sont
AJOUTEES a l'analyse existante, jamais a sa place (fusionner_enrichissement).

Par defaut : simulation (compte les AO, n'appelle pas le modele).

Le travail est fait par app.modules.maintenance.enrichir_analyses, aussi lance
depuis le panneau d'administration (tache Celery) depuis le 2026-09-30.

Usage (dans le conteneur ao-watcher-api) :
  python enrichir_analyses.py              # simulation
  python enrichir_analyses.py --reel       # appels reels, un AO a la fois
  python enrichir_analyses.py --reel --limite 5 --pause 5

Lancer AVANT le script du backend (app/scripts/enrichir_analyses.py), qui
recopie ces analyses dans les AO importes.
"""

import argparse
import asyncio

from app.modules.maintenance import enrichir_analyses


def _afficher(fait: int, total: int) -> None:
    if fait:
        print(f"[{fait}/{total}]")


async def main(reel: bool, limite: int | None, pause: float) -> None:
    r = await enrichir_analyses(reel, limite, pause, _afficher)
    print(f"AO ouverts deja analyses : {r['deja_analyses']} ; a enrichir : {r['a_enrichir']}")
    print(f"Estimation : au plus {r['a_enrichir']} appels, ~{r['jetons_entree_estimes']:,} jetons "
          f"en entree et ~{r['jetons_sortie_estimes']:,} en sortie (modele {r['modele']}).")
    if not reel:
        print("Simulation : rien n'a ete appele ni modifie. Relancer avec --reel.")
        return
    print(f"Termine : {r['enrichis']} AO enrichis, {len(r['ignores'])} ignores.")
    for e in r["ignores"]:
        print(f"  - AO {e['ao_id']} : {e['raison']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reel", action="store_true", help="appeler vraiment le modele et enregistrer")
    parser.add_argument("--limite", type=int, default=None, help="nombre maximum d'AO a traiter")
    parser.add_argument("--pause", type=float, default=3.0, help="secondes entre deux appels")
    args = parser.parse_args()
    asyncio.run(main(args.reel, args.limite, args.pause))
