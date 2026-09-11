## Deliverable

La fiche AO affiche, en plus du verdict Go/No-Go déjà calculé, une **matrice de
risque** (grille probabilité x impact, chaque risque = une clause précise du
CPS/RC, 4 niveaux de sévérité) et les sections encore manquantes d'une fiche AO
complète : décomposition budgétaire, clauses contractuelles à surveiller,
questions à poser au maître d'ouvrage, jalons/dates clés, checklist des pièces à
produire. Inspiré de la page détail AO de Bidtndr (sommaire complet : Objet du
marché / Acheteur & cadre / Chiffres clés / Spécificités / Checklist préparation
/ Échéances clés / Exigences techniques majeures / Critères d'évaluation /
Conditions d'éligibilité / Pièces à produire / Décomposition budgétaire /
Clauses contractuelles à surveiller / Délais et planning / Questions au MOA /
Jalons).

## Note de nommage

Dossier renommé `analyse-cps-enrichie` -> `analyse-ao-enrichie` le 2026-09-12 :
l'ancien nom laissait croire que seul le CPS était analysé. **Vérifié dans le
code, le RC est déjà traité** : `analysis.py:53` construit le prompt avec
`_build_analyze_prompt(cps_text, rc_text)`, lit les deux clés MinIO (`cps` et
`rc`), et le prompt porte même une consigne de repli explicite ("Si RC absent :
déduis depuis le CPS"). Idem côté app principale (`ao_tasks.py:252`, "Lit CPS +
RC"). Rien à corriger sur ce point, seulement le nom du dossier.

## Bug réel trouvé en vérifiant (2026-09-12, pas encore corrigé)

`analysis.py:112-113` lit `docs.get("cps")` et `docs.get("rc")` -- **une seule
clé chacun**. Or depuis le fix de collision de labels du 2026-08-17, un AO
multi-lots stocke `cps`, `cps_2`, `cps_3`... (un CPS par lot, voir
`progress-tracker.md`). **Les lots 2 et suivants ne sont donc jamais analysés**,
silencieusement : l'analyse d'un AO à 3 lots ne voit que le premier fichier et
ne signale rien. À corriger dans ce chantier, c'est le même code qu'on ouvre.

S'y ajoute une troncature muette : `_extract_pdf_text(cps_key, 60000)` et
`(rc_key, 40000)` (lignes 121-122) coupent le texte sans qu'aucun signal ne
remonte -- sur un CPS volumineux, le LLM analyse un document amputé sans que ni
lui ni l'utilisateur ne le sache. À traiter au moins par un avertissement, la
stratégie (chunking, priorisation de sections) restant à décider en écrivant
`api.md`.

## Depends on

Rien de nouveau architecturalement. Étend le pipeline d'analyse CPS/RC déjà en
place côté `adjuja-watcher` :

- `app/modules/ao_scraper/analysis.py::analyze_ao` -- un seul appel Mistral par
  AO (jamais recalculé, résultat stocké dans `scraped_aos.analyse_json` et
  partagé entre toutes les orgs qui consultent cet AO, cf. le commentaire en
  tête du fichier). Le prompt actuel (`_build_analyze_prompt`) extrait déjà
  `contexte`, `documents_requis`, `criteres_ponderation`, `profils_requis`,
  `qualification_requise`, `certifications_requises`,
  `chiffre_affaires_minimum_exige`, `nombre_references_similaires_exige`,
  `montant_caution`. Ce chantier ajoute des clés au même JSON (`risques`,
  `decomposition_budgetaire`, `clauses_a_surveiller`, `questions_moa`,
  `jalons`), pas un second appel LLM séparé -- même document source (CPS/RC),
  même coût, un seul prompt à faire grossir.
- `app/services/eligibility_service.py` reste inchangé : le verdict Go/No-Go
  est une comparaison déterministe Python séparée, ce chantier ne le touche
  pas, seulement l'`analyse_json` qu'il consomme en lecture.
- Frontend : nouvelle section dans la fiche AO (`AoPipelinePage.tsx` ou
  composant dédié `RiskMatrix.tsx`), consomme `analyse_json` déjà exposé par
  `GET /api/v1/ao/{id}` (à vérifier -- si `analyse_json` n'est aujourd'hui pas
  sérialisé dans la réponse publique de cette route, c'est un ajout mineur,
  pas un nouveau endpoint).

## Build order

1. `api.md` -- prompt étendu (`_build_analyze_prompt`), taxonomie fixe des
   types de risque, calcul de sévérité (probabilité x impact -> 4 niveaux),
   correction de la lecture multi-lots (`cps_2`/`cps_3`...) et du silence sur
   la troncature, vérification que `analyse_json` étendu est bien exposé par
   l'API.
2. `client.md` -- composant matrice de risque (grille 3x3) + nouvelles
   sections de la fiche AO.

## Check when the feature is done

- Un AO réel avec CPS/RC déjà analysé (`analyse_json` non vide) affiche au
  moins un risque dans la matrice, extrait du texte réel du document (pas un
  placeholder).
- La sévérité (couleur/niveau) correspond bien à la combinaison probabilité x
  impact retournée par le LLM, pas calculée arbitrairement côté frontend.
- Les nouvelles sections (budget, clauses, questions MOA, jalons) sont vides
  proprement (pas d'erreur) sur un AO dont l'analyse date d'avant ce chantier
  (`analyse_json` sans les nouvelles clés).
- Un AO réel **multi-lots** (plusieurs `cps_N` en `classified_docs`) produit une
  analyse qui couvre tous les lots, vérifié sur un vrai AO à au moins 2 lots --
  l'AO 6388 (refConsultation 1029951, 3 lots, `cps`/`cps_2`/`cps_3` confirmés en
  DB le 2026-08-17) est le cas de test réel déjà connu.
- Tout ce qui est dans `api.md` et `client.md` passe individuellement son
  propre check avant celui-ci.

## Taxonomie des risques (validée par l'utilisateur le 2026-09-12)

| Type | Ce qu'on cherche dans le document |
|---|---|
| Financier | délai de paiement, retenue de garantie, révision des prix, caution |
| Pénalités | pénalités de retard, plafond, conditions de résiliation |
| Éliminatoire | seuils, note technique minimale, pièce dont l'absence élimine |
| Capacité technique | matériel imposé, personnel/profils exigés, certifications |
| Délai | durée d'exécution, planning imposé, jalons contraints |
| Administratif | pièces difficiles à obtenir, visite obligatoire, échantillons |

Le LLM retourne **probabilité et impact séparément**, jamais la sévérité :
celle-ci est calculée en Python à partir des deux axes, pour rester
reproductible et ne pas dépendre de l'humeur du modèle d'un appel à l'autre.

## Open Questions

- Stratégie sur la troncature (60k/40k caractères) : simple avertissement
  remonté à l'utilisateur, chunking en plusieurs appels, ou priorisation des
  sections utiles du document -- non tranché, à décider en écrivant `api.md`.
- Les AO déjà analysés avant ce chantier ne seront jamais rétro-enrichis sans
  décision explicite de relancer l'analyse (même limitation déjà documentée
  pour `mode_passation`, voir `progress-tracker.md` 2026-08-21e) -- à trancher
  si un backfill est voulu ou si on attend l'usure naturelle du stock d'AO en
  cours.
