# mode-accompagne / api.md

Backend du second régime de traitement d'un AO. Voir `00-overview.md` pour le
pourquoi et les 7 étapes. Ce fichier ne traite que le backend ; l'UI est dans
`client.md`, à écrire après.

## Ce que le code fait aujourd'hui (vérifié, pas supposé)

Lu le 2026-09-12 dans `adjuja-backend` :

- `ao_routes.py:466-476` -- `POST /{ao_id}/start-pipeline` pose
  `statut="en_analyse"`, `pipeline_pct=0`, puis lance
  `chain(task_classify_uploads | task_analyze_ao_context | task_build_pipeline)`.
- `ao_tasks.py:330-374` -- `task_build_pipeline` est **déjà dynamique** : il lit
  `analyse_json["documents_requis"]` et ne lance `task_generate_note_metho` que
  s'il existe un document `source == "generer"`, `task_fill_documents` que s'il
  en existe un `source == "remplir"`. S'il n'y a ni l'un ni l'autre, il saute
  directement à `task_sign_and_compile`.
- `task_match_team` (ligne 367) est lancé en `.delay()` **hors du chord** si
  `analyse_json["profils_requis"]` est non vide : son résultat n'est donc jamais
  attendu par `task_sign_and_compile`. C'est un détachement réel de
  l'orchestration, pas un oubli de lecture.
- Points d'enchaînement dans tout le fichier : **deux seulement**,
  `task_build_pipeline` (lignes 359-373) et la fin de `task_sign_and_compile`
  (ligne 1007, `task_index_results.delay`). Aucune autre tâche ne s'auto-enchaîne.
- Jalons de progression : `pipeline_pct` vaut 20 après analyse, 50 après note
  métho, 70 après remplissage, 100 après signature.
- `AppelOffre.statut` observé : `brouillon`, `en_attente`, `en_analyse`,
  `en_traitement`, `termine`, `erreur`.

**Inexactitude de docstring relevée au passage** : `ao_tasks.py:252` annonce
"Lance task_build_pipeline ensuite" alors que `task_analyze_ao_context` ne
lance rien (aucun `.delay`/`.si` dans son corps) -- c'est le `chain` de la route
qui enchaîne. À corriger en passant, c'est trompeur pour la suite.

**Conséquence de conception principale** : le parcours à 7 étapes est lui aussi
**dynamique**. Un AO sans document `source == "remplir"` n'a pas d'étape 6.
La logique qui en décide existe déjà dans `task_build_pipeline` -- elle doit
être **extraite et partagée**, jamais réécrite en double, sinon les deux modes
divergeront silencieusement le jour où l'un des deux est modifié.

## Modèle de données

### 1. Nouvelle colonne sur `appels_offres`

| Colonne | Type | Défaut | Rôle |
|---|---|---|---|
| `mode` | `String` | `"express"` | `"express"` ou `"accompagne"` |

Défaut `"express"` : toutes les lignes existantes gardent exactement le
comportement actuel, aucune migration de données. Le mode est porté **par AO**,
décidé au lancement du traitement.

### 2. Nouvelle table `ao_pipeline_steps`

Une ligne par étape et par AO, créée au lancement en mode accompagné.

| Colonne | Type | Rôle |
|---|---|---|
| `id` | `String` PK | uuid4 |
| `ao_id` | `String` FK `appels_offres.id` | cascade delete |
| `step_key` | `String` | `documents`, `comprehension`, `decision`, `preparation`, `redaction`, `remplissage`, `signature` |
| `step_order` | `Integer` | 1 à 7, pour l'affichage |
| `statut` | `String` | voir machine à états ci-dessous |
| `applicable` | `Boolean \| null` | `null` = pas encore déterminé |
| `erreur_message` | `String \| null` | |
| `started_at` | `String \| null` | ISO 8601 |
| `completed_at` | `String \| null` | ISO 8601 |
| `validated_at` | `String \| null` | ISO 8601 |
| `validated_by` | `String \| null` FK `users.id` | qui a validé |

Contrainte `UNIQUE (ao_id, step_key)`, index sur `(ao_id, step_order)`.

**Table plutôt que JSONB sur `appels_offres`**, contrairement au réflexe
`extra`/`analyse_json` du projet : on a besoin de savoir *qui* a validé *quoi* et
*quand* (donnée d'audit, pas d'affichage), et `dashboard-collaboratif` devra
répondre à "quels AO attendent une validation de ma part" -- une requête
indexée sur des colonnes, pas un parcours jsonb. `code-standards.md` autorise
explicitement le pattern dédié quand il y a une vraie raison ; ici il y en a une.

**Timestamps en `String` ISO 8601** bien que ce soit une table neuve : tout le
domaine AO expose déjà `created_at`/`updated_at` en `str` (`ao_pipeline.py:30-31`),
mélanger `DateTime` ici créerait deux conventions de sérialisation dans la même
réponse API.

### 3. Migration Alembic

Migration `013`, additive uniquement, suivant le pattern `try/except pass`
idempotent des migrations `007`-`011` (maison, voir `code-standards.md`).
Aucune donnée existante touchée : `mode` est ajouté avec un défaut, la table est
créée vide.

## Machine à états d'une étape

```
a_faire -> en_cours -> attente_validation -> validee
              |                                 |
              v                                 v
           erreur                          (étape suivante)

non_applicable  (terminal, posé quand applicable=false)
```

- `a_faire` -- créée, pas encore lancée.
- `en_cours` -- la tâche Celery tourne.
- `attente_validation` -- **l'état qui définit le mode accompagné**. La tâche a
  fini, le résultat est consultable, rien ne s'enchaîne.
- `validee` -- l'utilisateur a validé ; l'étape suivante applicable devient
  lançable.
- `non_applicable` -- cet AO n'a pas cette étape (pas de document à remplir, par
  exemple). Sautée à l'affichage comme à l'enchaînement.
- `erreur` -- `erreur_message` renseigné, relançable.

### Retour en arrière

Décidé (recommandation posée le 2026-09-12, non contredite) : **revenir sur une
étape déjà validée invalide toutes les étapes suivantes**, qui repassent à
`a_faire` et dont les artefacts produits sont marqués périmés.

Raison : sans ça, on peut aboutir à une note méthodologique amendée à l'étape 5
et un ZIP compilé à l'étape 7 à partir de l'ancienne version, sans que rien ne le
signale. Ce projet a déjà un historique de ce type d'incohérence silencieuse
(`enrich()` qui n'assignait pas `mode_passation`, `_classify()` qui écrasait
`cps.pdf`). Coût assumé : l'utilisateur qui corrige tard refait des étapes.

## Endpoints

Tous sous le router AO existant (`/api/v1/ao`), tous avec
`Depends(get_current_user)`, tous vérifiant l'appartenance à l'org comme les
routes voisines (`org_id = current_user.org_id or current_user.id`).

### `POST /{ao_id}/start-pipeline` (existant, étendu)

Gagne un corps optionnel `{ "mode": "express" | "accompagne" }`, défaut
`"express"`.

- `express` -- comportement **strictement inchangé**, même `chain`. C'est le
  chemin en production, il ne doit pas bouger.
- `accompagne` -- crée les 7 lignes `ao_pipeline_steps` (`applicable = null`
  pour `redaction`/`remplissage`, `true` pour les autres), pose
  `mode="accompagne"`, puis lance **la seule étape 1** (`task_classify_uploads`),
  pas un `chain`.

Conserve les gardes existantes (profil entreprise configuré, champs requis) --
elles sont antérieures et valables pour les deux modes.

### `GET /{ao_id}/steps`

Retourne l'état du parcours : liste ordonnée des étapes avec `step_key`,
`statut`, `applicable`, `erreur_message`, horodatages, `validated_by`. Sur un AO
en mode express, retourne une liste vide (pas une erreur) -- le frontend affiche
alors l'écran de progression actuel.

### `POST /{ao_id}/steps/{step_key}/validate`

La porte. Vérifie que l'étape est bien en `attente_validation`, la passe à
`validee` (`validated_at`, `validated_by`), puis **déclenche la tâche de la
prochaine étape applicable**. Si aucune ne suit, l'AO passe `statut="termine"`.

Corps optionnel `{ "corrections": {...} }` pour les étapes où l'utilisateur
amende le résultat (voir "Corrections" plus bas).

`409` si l'étape n'est pas en attente de validation ; `404` si l'AO n'est pas en
mode accompagné.

### `POST /{ao_id}/steps/{step_key}/rerun`

Relance une étape : en `erreur` (reprise sur incident) ou en `validee` (retour en
arrière volontaire, qui invalide les suivantes comme décrit plus haut). Repasse
l'étape à `en_cours` et relance sa tâche.

### `GET /{ao_id}/steps/{step_key}/assist` et `POST .../assist`

Assistance IA contextualisée sur l'AO **et** l'étape courante. Voir
"Assistance IA" plus bas.

## Orchestration : où le mode se décide

Le mode ne doit **jamais** être testé à l'intérieur des tâches métier : elles
font leur travail, elles ne savent pas dans quel régime elles tournent. Sinon
`if mode == ...` se répand dans sept tâches et les deux régimes divergent.

Deux points de bascule seulement, ceux déjà identifiés dans le code :

1. **Fin de chaque tâche** -- une fonction partagée
   `advance_or_gate(ao_id, step_key)` appelée en fin de tâche : en mode express
   elle enchaîne comme aujourd'hui, en mode accompagné elle pose
   `attente_validation` et s'arrête. Un seul endroit porte la différence.
2. **`task_build_pipeline`** -- sa logique de décision
   (`needs_note_metho`/`needs_fill` lignes 353-354) est extraite dans une
   fonction pure `applicable_steps(analyse_json) -> dict[str, bool]`, appelée
   par les deux modes : le chord en express, le calcul d'`applicable` en
   accompagné. **C'est le point le plus important de cette spec** -- c'est là que
   les deux modes peuvent silencieusement diverger.

### Étapes 5 et 6 rendues séquentielles

En express, `task_generate_note_metho` et `task_fill_documents` tournent en
parallèle dans un `group`. En accompagné elles deviennent séquentielles
(rédaction validée, puis remplissage).

**À vérifier avant d'implémenter, pas à supposer** : qu'aucune des deux ne
dépende d'un effet de bord de l'autre du fait de leur exécution simultanée
(écriture concurrente sur `AoDocument`, lecture d'un artefact produit par
l'autre). Lire le corps réel des deux tâches (lignes 514-692 et 693-816) avant
d'écrire la première ligne de code. Si une dépendance existe, elle est
aujourd'hui masquée par une course, donc c'est un bug latent du mode express
aussi, à traiter comme tel.

### `task_match_team`

Détaché (`.delay()` hors chord) aujourd'hui. En accompagné il alimente l'étape 4
(Préparation) et doit donc être **attendu**, pas détaché -- sinon l'étape 4
s'affiche vide alors que le matching tourne encore. Le rendre attendu en
accompagné ne change rien à express.

## Les étapes 3 et 4, qui n'ont pas de tâche

- **Étape 3, Décision** -- pas de tâche Celery : le verdict est un calcul
  déterministe à la demande (`eligibility_service.py::compute_verdict`, exposé
  par `POST /ao/eligibility-check`, `ao_routes.py:180`). L'étape est donc
  `attente_validation` dès son ouverture : elle n'attend aucun calcul de fond,
  seulement la décision humaine d'y aller ou non. Valider = "je soumissionne" ;
  un refus explicite clôt l'AO sans passer aux étapes suivantes (nouveau statut
  d'AO `abandonne`, à ne pas confondre avec `erreur`).
  Quand `context/feature-spec/fit-score/` sera livré, c'est son score qui
  s'affiche ici à la place du verdict brut -- l'étape ne change pas de forme.
- **Étape 4, Préparation** -- checklist des pièces à produire et des manques du
  profil. Consomme `analyse_json["documents_requis"]` (déjà là) et la checklist
  enrichie de `context/feature-spec/analyse-ao-enrichie/`, plus le résultat de
  `task_match_team`. Pas de nouvelle tâche : agrégation en lecture.

## Corrections apportées par l'utilisateur

Une correction à une étape doit être **réellement reprise** par les suivantes,
jamais écrasée par une regénération silencieuse (c'est un critère de recette du
`00-overview.md`).

- Étape 2 -- corriger l'analyse écrit dans `analyse_json`, qui est la source de
  toutes les étapes suivantes. **Attention** : `analyse_json` est stocké côté
  `adjuja-watcher` sur `scraped_aos` et **partagé entre toutes les orgs** qui
  consultent le même AO (commentaire en tête de `analysis.py`). Une correction
  utilisateur ne doit donc **pas** écraser l'analyse partagée : elle est stockée
  comme surcouche par AO de l'org (`appels_offres.analyse_json`, qui est une
  copie locale déjà existante, `ao_pipeline.py:36`). À reverifier dans le code
  avant d'implémenter -- si la copie locale est en réalité une référence, cette
  étape corromprait les données des autres orgs.
- Étape 5 -- la note amendée remplace le document généré ; l'étape 7 compile
  celui-là, pas une regénération.
- Étape 6 -- les champs corrigés priment sur les champs remplis par l'IA.

## Assistance IA par étape

Réutilise `ChatService`/`RagService` existants, avec un contexte restreint à
l'AO courant et à l'étape courante. **Pas un second système** : c'est le même
assistant que celui prévu par `context/feature-spec/preview-documents-ocr/`, à
construire une seule fois ici puisque ce chantier passe en premier.

Chaque étape fournit son propre cadrage (ce que l'assistant sait, ce qu'il peut
proposer) : expliquer une exigence à l'étape 2, justifier un facteur du score à
l'étape 3, proposer une reformulation à l'étape 5. Le détail des prompts par
étape est à écrire au moment de l'implémentation, pas figé ici.

## Facturation

Un AO traité en accompagné consomme **un** AO du quota mensuel
(`Plan.max_ao_per_month`, enforcement 402 déjà en place sur `create_ao`), comme
en express : c'est le même AO, pas deux.

Il coûte en revanche plus d'appels LLM (regénérations, assistance). Non traité
dans cette v1, signalé comme point de surveillance : si l'usage réel montre un
écart de coût significatif, le levier existe déjà (plafond fair-use, comme les
300 AO/mois posés sur le plan Pro pour la même raison).

## Check

- Un AO réel lancé en accompagné s'arrête après l'étape 1 et ne déclenche pas
  l'étape 2 avant validation -- vérifié en base (`ao_pipeline_steps.statut`),
  pas seulement à l'écran.
- Un AO réel lancé en express produit le même résultat qu'avant ce chantier, un
  clic jusqu'au ZIP signé. **C'est le risque principal** : la `chain` existante
  est du code en production.
- Un AO sans document `source == "remplir"` a bien son étape 6 en
  `non_applicable`, et l'enchaînement la saute.
- Fermer le navigateur en cours d'étape 5 puis revenir remet sur l'étape 5,
  état relu depuis la base.
- Revenir sur l'étape 2 après avoir validé jusqu'à 5 remet bien 3, 4 et 5 en
  `a_faire`.
- Une correction faite à l'étape 5 est celle qui part à la compilation de
  l'étape 7, vérifié en ouvrant le ZIP produit.

## Questions tranchées le 2026-09-12, en lisant le code avant d'implémenter

- **`analyse_json` est une copie locale, pas une référence.** `import_from_watcher`
  le reçoit dans le payload HTTP (`ao_routes.py:119`) et l'écrit dans la colonne
  JSONB de sa propre ligne `appels_offres` (`models.py:180`). Une correction à
  l'étape 2 n'atteint aucune autre org. La conception ci-dessus tient telle quelle.
- **Aucune dépendance cachée entre `task_generate_note_metho` et
  `task_fill_documents`.** La note écrit `origine="genere"`, le filler ne lit que
  `origine="upload"` (`ao_tasks.py:722-726`) ; leurs suppressions préalables
  portent sur des ensembles disjoints. Les rendre séquentielles est sûr. Seul
  effet partagé : les deux écrivent `pipeline_pct` (50 puis 70), donc en parallèle
  le pourcentage peut redescendre. Cosmétique, disparaît en séquentiel.
- **Mais une vraie course existe ailleurs, dans le mode express en production** :
  `task_generate_note_metho` lit `AoTeamMember` (`ao_tasks.py:559-561`) pendant
  que `task_match_team`, lancé détaché (`ao_tasks.py:367`), peut encore tourner.
  La note peut donc partir **sans équipe, en silence**. Résolu côté accompagné
  (le matching est la tâche de l'étape 4, donc attendu), **non corrigé côté
  express** : cela obligerait à modifier le chord de production, ce que cette
  spec identifie comme le risque principal du chantier. À arbitrer séparément.
- **Le statut `abandonne` ne casse aucun filtre frontend.** Tous les filtres sont
  des tests positifs et `StatusBadge` a un fallback (`AoPipelinePage.tsx:51`) ;
  il faut seulement lui ajouter une couleur et une traduction dans `client.md`.

## Open Questions

- Un AO en accompagné peut-il basculer en express en cours de route ("fais le
  reste tout seul") ? Utile et peu coûteux a priori. L'inverse (reprendre en
  accompagné un AO déjà traité en express) est beaucoup moins clair. Non tranché,
  non implémenté.
- Les corrections des étapes 5 (texte de la note) et 6 (champs remplis) portent
  sur des artefacts MinIO, pas sur la ligne AO. Le corps `corrections` de
  `validate` ne traite aujourd'hui que l'étape 2 et ignore les autres avec un log.
  Les routes documents dédiées restent à concevoir.
