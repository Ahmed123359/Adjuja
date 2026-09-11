## Deliverable

Nouvelle page/tab "Concurrents" dans l'app : identification des entreprises
qui soumissionnent sur les mêmes types de marchés que l'utilisateur, suivi de
leur évolution (nombre de marchés gagnés, montants, secteurs), à partir des
résultats d'attribution réels -- inspiré de l'onglet "Marché PV" de Bidtndr
(vue globale du marché, pas seulement les AO de l'org).

## Depends on

- **Bloquant** : `context/feature-spec/resultats-attribution/` doit livrer
  `watcher.award_results`/`award_bids` avant que ce chantier ait une donnée
  réelle à afficher. Rien à construire ici tant que l'autre n'a pas un
  premier scrape réel vérifié.
- Critères de détection "concurrent" -- pas encore définis avec
  l'utilisateur (voir Open Questions). Candidats déductibles de la donnée une
  fois `award_results` peuplé : même secteur (`secteur_codes`, référentiel
  déjà en place), même zone géographique, montants dans une fourchette
  similaire, présence répétée sur les mêmes types d'AO que l'org a
  soumissionnés ou favorisés.
- Frontend : nouveau tab au même niveau que Veille/BDC (`VeillePage.tsx`,
  `BdcPage.tsx` comme précédent structurel), pas un composant secondaire
  caché dans un autre écran.

## Build order

1. `api.md` -- endpoint(s) de requête sur `award_results` filtré par secteur/
   zone/critères de "concurrent", agrégation (nb marchés gagnés, montant
   total, évolution dans le temps).
2. `client.md` -- nouvelle page, réutilise les patterns de filtre déjà en
   place (`FilterSection`, `SecteurPicker`) plutôt que d'inventer un nouveau
   système de filtres.

## Check when the feature is done

- La liste des concurrents affichée pour une org réelle correspond à des
  entreprises qui ont réellement gagné des marchés dans son secteur d'après
  `award_results`, pas une liste statique/placeholder.
- Un montant ou un nombre de marchés affiché correspond à une somme/comptage
  réel vérifiable par requête SQL directe sur les données scrapées.

## Open Questions

- Critère de définition d'un "concurrent" non tranché avec l'utilisateur --
  la discussion en amont a listé plusieurs candidats (secteur, zone,
  fourchette de montant, récurrence sur les mêmes AO) sans en choisir un
  set précis. À trancher avant `api.md`, ce choix change entièrement la
  requête d'agrégation.
- Ce chantier ne peut pas commencer réellement avant qu'un premier scrape de
  `resultats-attribution` ait tourné en conditions réelles -- ne pas
  commencer `api.md` sur des données supposées.
