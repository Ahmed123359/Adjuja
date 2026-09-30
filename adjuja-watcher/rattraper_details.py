"""
Rattrape l'estimation, la caution, le secteur, la reference et le lien du DCE
des AO encore ouverts.

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

Le travail est fait par app.modules.maintenance.rattraper_details, aussi lance
depuis le panneau d'administration (tache Celery) depuis le 2026-09-30.

Usage (dans le conteneur ao-watcher-api) :
  python rattraper_details.py              # simulation
  python rattraper_details.py --reel       # lit les pages et enregistre
  python rattraper_details.py --reel --limite 50 --pause 1.5
"""

import argparse
import asyncio

from app.modules.maintenance import SOURCES_AO, rattraper_details


def _afficher(fait: int, total: int) -> None:
    if fait and fait % 25 == 0:
        print(f"  {fait}/{total}")


async def main(reel: bool, limite: int | None, pause: float, sources: tuple[str, ...]) -> None:
    r = await rattraper_details(reel, limite, pause, sources, _afficher)
    print(f"AO ouverts a completer : {r['a_completer']} {r['par_source']}")
    print(f"Duree estimee : ~{r['duree_estimee_min']} min (une page a la fois, pause {pause} s).")
    if not reel:
        print("Simulation : aucune page lue, rien d'enregistre. Relancer avec --reel.")
        return
    print(f"Termine : {r['completes']} AO mis a jour, {r['pages_illisibles']} pages illisibles, "
          f"{r['sans_estimation_ni_caution']} sans estimation ni caution publiees.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reel", action="store_true", help="lire les pages et enregistrer")
    parser.add_argument("--limite", type=int, default=None, help="nombre maximum d'AO")
    parser.add_argument("--pause", type=float, default=1.5, help="secondes entre deux pages")
    parser.add_argument("--source", choices=SOURCES_AO, default=None, help="une seule source")
    args = parser.parse_args()
    asyncio.run(main(args.reel, args.limite, args.pause, (args.source,) if args.source else SOURCES_AO))
