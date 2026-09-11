## Deliverable

Un **second régime de traitement d'un AO**, étape par étape, où l'utilisateur
valide et corrige à chaque étape avec l'IA en accompagnement -- à côté du mode
actuel "minimum de clics" qui reste inchangé et reste le défaut.

Décidé avec l'utilisateur le 2026-09-12 : les deux modes **coexistent**, ce
chantier ne remplace pas l'existant. Le choix se fait au lancement du
traitement d'un AO :

- **Express** (l'actuel) -- un clic, tout s'enchaîne, l'utilisateur récupère un
  ZIP signé. Pour l'utilisateur pressé ou l'AO à faible enjeu.
- **Accompagné** (nouveau) -- 7 étapes, une porte de validation entre chacune,
  l'IA explique / justifie / propose à chaque étape et l'utilisateur peut
  corriger avant de passer à la suivante. Pour l'AO à enjeu, où livrer un
  dossier sans jamais l'avoir relu est précisément ce qui fait peur.

C'est le chantier qui change le **modèle d'interaction** du produit ; les
autres chantiers de l'initiative Bidtndr ajoutent des fonctionnalités autour.
Priorité posée au-dessus des autres pour cette raison.

## Les 7 étapes (validées par l'utilisateur le 2026-09-12)

| # | Étape | Ce que l'utilisateur fait | Tâche Celery existante |
|---|---|---|---|
| 1 | Documents | confirme quel fichier est quoi après classification | `task_classify_uploads` |
| 2 | Compréhension de l'AO | lit l'analyse enrichie (objet, exigences, risques, jalons), corrige | `task_analyze_ao_context` |
| 3 | Décision | tranche s'il y va, au vu du fit score / Go-No-Go | **aucune** (calcul à la demande) |
| 4 | Préparation | voit la checklist des pièces et ce qui manque à son profil | **aucune** (n'existe pas) |
| 5 | Rédaction | relit et amende la note méthodologique avant de valider | `task_generate_note_metho` |
| 6 | Remplissage | vérifie les documents administratifs champ par champ | `task_fill_documents` |
| 7 | Signature & dossier final | signe, compile, récupère le ZIP | `task_sign_and_compile` |

**Cinq étapes sur sept correspondent à une tâche Celery qui existe déjà.** Le
moteur n'est pas à réécrire : il est à désassembler et à contrôler. Les étapes
3 et 4 sont les seules réellement neuves -- l'étape 3 s'appuie sur
`eligibility_service.py::compute_verdict` (calculé à la demande via une route,
pas une tâche de pipeline) et sur `context/feature-spec/fit-score/` ; l'étape 4
consomme la checklist des pièces produite par
`context/feature-spec/analyse-ao-enrichie/`.

## Depends on

### L'existant qu'on désassemble

- `app/api/routes/ao_routes.py:466-476` -- le mode Express est un
  `chain(task_classify_uploads | task_analyze_ao_context | task_build_pipeline)`
  lancé en fire-and-forget. Le mode accompagné a besoin des mêmes tâches
  déclenchables **une par une**, pas d'une chaîne soudée. Le `chain` actuel
  reste tel quel pour le mode Express -- ne pas le casser en route.
- `app/tasks/ao_tasks.py:330-374` -- `task_build_pipeline` lance un
  `chord(group(note_metho, fill_docs), sign_and_compile)` : rédaction et
  remplissage tournent **en parallèle** aujourd'hui. En mode accompagné ils
  deviennent deux étapes distinctes et séquentiellement validées (5 puis 6).
  **Conséquence réelle à ne pas sous-estimer** : ce n'est pas qu'un changement
  d'UI, c'est une orchestration différente pour le même travail.
- `ao.statut` / `ao.pipeline_pct` (`app/models/ao_pipeline.py:28-29`) -- l'état
  existe déjà mais il est **trop grossier** : quatre valeurs réelles observées
  dans le code (`brouillon`, `en_analyse`, `en_traitement`, `termine`,
  `erreur`) pour ce qui doit devenir un parcours à 7 étapes, chacune avec son
  propre statut (à faire / en cours / en attente de validation / validée /
  en erreur). Nouvelle donnée d'état à persister, migration Alembic.
- `AoPipelinePage.tsx` -- page pipeline existante, dont `canStart` vaut
  `statut === "brouillon" || statut === "erreur"` (ligne 491). C'est le point
  d'entrée naturel du choix de mode, et l'écran que le stepper étend.

### Ce qui est neuf

- **Machine à états persistée par AO** : étape courante, statut par étape,
  qui a validé et quand. Sans elle, un utilisateur qui ferme son navigateur au
  milieu de l'étape 5 perd le fil -- c'est tout l'intérêt du mode.
- **Porte de validation** : une étape terminée n'enchaîne pas automatiquement,
  elle attend une action explicite. C'est la différence de fond avec le mode
  Express, et la raison pour laquelle la `chain` Celery ne peut pas être
  réutilisée telle quelle.
- **Assistance IA par étape** : réutilise `ChatService`/`RagService` déjà en
  place (voir `context/feature-spec/chatbot/`) plutôt qu'un second système,
  avec un contexte restreint à l'AO et à l'étape courante. Recoupe directement
  l'"assistant IA de préparation d'AO" déjà prévu dans
  `context/feature-spec/preview-documents-ocr/` -- **à construire une seule
  fois, pas deux** : si ce chantier passe en premier, l'autre le consomme.
- **Reprise et retour en arrière** : revenir à une étape déjà validée pour la
  refaire (regénérer la note après avoir corrigé le profil, par exemple). À
  cadrer -- voir Open Questions.

## Build order

1. `api.md` -- machine à états (migration Alembic, statut par étape),
   endpoints de déclenchement d'une étape isolée et de validation d'une étape,
   réutilisation des tâches Celery existantes sans casser le `chain` du mode
   Express, contexte d'assistance IA par étape.
2. `client.md` -- stepper dans `AoPipelinePage.tsx`, écran par étape, choix du
   mode au lancement, panneau d'assistance IA contextuel.

## Check when the feature is done

- Un AO réel traité en mode Accompagné s'arrête réellement après chaque étape
  et **n'enchaîne pas** tant que l'utilisateur n'a pas validé -- vérifié sur un
  vrai AO, pas seulement par lecture du code.
- Le mode Express continue de fonctionner exactement comme avant sur un autre
  AO réel (un clic -> ZIP signé), sans régression -- c'est le risque principal
  de ce chantier, la `chain` existante étant du code en production.
- Fermer le navigateur au milieu de l'étape 5 puis revenir remet l'utilisateur
  sur l'étape 5, pas au début -- l'état est bien persisté en base, vérifié par
  requête SQL directe et pas seulement parce que l'UI le réaffiche.
- Une correction faite par l'utilisateur à une étape est réellement prise en
  compte par l'étape suivante (ex: une note méthodologique amendée à l'étape 5
  est bien celle qui part à la compilation de l'étape 7), pas écrasée par une
  regénération silencieuse.
- L'assistance IA d'une étape répond en tenant compte de l'AO courant, pas
  comme un chat générique.

## Open Questions

- **Choix du mode : par AO ou préférence d'organisation ?** Proposé : par AO au
  moment du lancement, avec un défaut réglable au niveau de l'org. Pas validé.
- **Retour en arrière** : revenir à une étape validée invalide-t-il les étapes
  suivantes déjà faites (plus sûr, plus frustrant) ou les laisse-t-il en place
  au risque d'une incohérence entre une note regénérée et un ZIP déjà compilé ?
  À trancher avant `api.md`, ça change la machine à états.
- **Un AO déjà traité en Express peut-il être repris en Accompagné** (et
  inversement, abandonner le pas-à-pas pour "faire le reste automatiquement") ?
  Le second sens paraît utile et peu coûteux, le premier beaucoup moins clair.
- **Facturation** : le mode accompagné consomme-t-il le même quota AO/mois que
  le mode Express (`Plan.max_ao_per_month`, enforcement déjà en place en 402
  sur `create_ao`) ? Il fait plus d'appels LLM par AO du fait des
  regénérations et de l'assistance. Non discuté.
- **Étapes 5 et 6 rendues séquentielles** : vérifier qu'aucune des deux tâches
  ne dépend d'un effet de bord de l'autre du fait qu'elles tournaient jusqu'ici
  dans le même `group` Celery. À faire en lisant le code réel des deux tâches
  avant d'écrire `api.md`, pas à supposer.
