## Deliverable

Un score de compatibilité personnalisé /100 par AO, remplaçant la lecture brute
du verdict Go/No-Go par une décomposition pondérée en 6 facteurs, chacun avec
son propre score, sa confiance, et une justification textuelle -- inspiré du
"Fit Score personnalisé" de Bidtndr, adapté à ce qu'Adjuja a déjà en base.
Contrairement au verdict actuel (go/no_go/risque, une seule ligne de raisons),
le score reste continu même quand l'éligibilité est bloquée, et pointe
explicitement l'action pour l'améliorer ("Compléter mes qualifications").

## Depends on

- `app/services/eligibility_service.py::compute_verdict` -- logique de
  comparaison déterministe déjà écrite et fonctionnelle (CA, références,
  certifications, qualification, délai). Ce chantier ne la remplace pas, il la
  redécompose en facteurs pondérés au lieu d'un verdict binaire + liste de
  raisons. Deux facteurs sur les six sont déjà calculables sans rien ajouter :
  qualifications/certifications (`extra.classifications`/`extra.certifications`,
  déjà comparées) et conformité administrative (ICE/RC/capital déjà en base
  depuis la migration 011).
- **Manque en base, à ajouter** : chiffre d'affaires annuel structuré
  (`extra.chiffre_affaires_moyen` existe déjà comme clé JSONB lue par
  `eligibility_service.py:38`, donc le champ existe informellement -- vérifier
  s'il est exposé dans un vrai formulaire du profil entreprise ou seulement
  consommé côté backend) et un référentiel équipements (n'existe pas du tout,
  `staff_cvs` couvre les profils humains mais pas le matériel).
- Références similaires : réutilise `RagService`/Qdrant
  (`offria_kb_{org_id}`, voir `context/feature-spec/chatbot/`) pour le
  matching sémantique plutôt que de réinventer un moteur de similarité --
  cohérent avec `architecture-context.md`'s pattern "une interface, plusieurs
  implémentations" déjà en place pour les providers LLM/paiement.
- Consomme `analyse_json` (voir `context/feature-spec/analyse-ao-enrichie/`)
  pour les exigences extraites du CPS -- ce chantier peut démarrer en
  parallèle (l'`analyse_json` actuel a déjà les champs nécessaires aux
  facteurs qualifications/CA/références), l'enrichissement de l'autre
  chantier ne bloque pas celui-ci.

## Facteurs proposés (à valider avec l'utilisateur avant de coder)

| Facteur | Poids | Source |
|---|---|---|
| Qualifications & certifications | 30% | `extra.classifications`/`certifications`, déjà comparé |
| Conformité administrative | 15% | ICE/RC/capital (migration 011), validité/complétude |
| Références similaires | 20% | matching sémantique Qdrant `offria_kb_{org_id}` |
| Capacité financière | 15% | CA moyen vs `chiffre_affaires_minimum_exige` |
| Adéquation moyens | 10% | `staff_cvs` + nouveau référentiel équipements |
| Proximité géo + bonus contextuels | 10% | siège vs zone d'exécution, préférence nationale/PME |

Gate dure identique à l'existant : une qualification/certification obligatoire
manquante bloque l'éligibilité même si le score global est élevé (reprend le
`hard_fails` -> `no_go` de `compute_verdict`).

## Build order

1. `api.md` -- nouveau `FitScoreService` (ou extension d'`eligibility_service.py`
   en `compute_fit_score`, à trancher : garder `compute_verdict` tel quel pour
   compat ou le faire rentrer dans le nouveau calcul), migration Alembic pour
   les nouveaux champs profil (CA structuré si pas déjà propre, référentiel
   équipements), nouvel endpoint (ex: `GET /api/v1/ao/{id}/fit-score`).
2. `client.md` -- composant score + détail par facteur (`FitScoreDetail.tsx`),
   CTA vers les pages de complétion de profil concernées.

## Check when the feature is done

- Sur un AO réel avec `analyse_json` rempli et un profil entreprise réel, le
  score global reflète correctement la moyenne pondérée des 6 facteurs.
- Une qualification obligatoire manquante bloque l'éligibilité (`Non
  éligible`) même si les autres facteurs sont hauts, comme le hard_fail
  actuel de `compute_verdict`.
- Le facteur "Références similaires" retourne un score cohérent avec au moins
  une référence réelle indexée dans Qdrant pour cette org -- pas un score
  fixe/placeholder.
- Tout ce qui est dans `api.md` et `client.md` passe individuellement son
  propre check avant celui-ci.

## Open Questions

- `compute_verdict` existant reste-t-il utilisé tel quel ailleurs (routes,
  frontend) au point de devoir cohabiter avec ce nouveau score, ou ce chantier
  le remplace complètement ? Non vérifié -- à faire avant `api.md`.
- Schéma exact du référentiel équipements (nouvelle table ? JSONB dans
  `company_profiles.extra`, même pattern que classifications/agréments ?) --
  pas tranché, `code-standards.md` à relire pour la convention JSONB vs table
  dédiée avant de décider.
- Pondérations proposées à valider avec l'utilisateur, pas figées.
