# dashboard-collaboratif / api.md

Backend de la première version du tableau de bord. Voir `00-overview.md` pour le
pourquoi et la portée complète du chantier ; l'écran est dans `client.md`, à
écrire après.

**Périmètre décidé avec l'utilisateur le 2026-09-15 : calendrier et tâches
d'abord.** Les mentions `@nom`, le flux d'alertes in-app et les jalons
personnalisés ne sont pas dans cette version.

## Ce que le code fait aujourd'hui (lu le 2026-09-15, pas supposé)

- `DashboardPage.tsx` est une zone de réglages à 6 onglets (`overview`,
  `profile`, `signature`, `documents`, `equipe`, `generation`), pas un tableau de
  bord. Les onglets vivent dans `features/company/tabs/` depuis le 2026-09-12.
- `OverviewTab.tsx` a déjà été refait sur le nouveau socle visuel
  (`shared/ui/tokens.css`, `Card`, `Badge`, `Page`) et **préfigure volontairement
  la composition du futur tableau de bord** : bandeau de statistiques, colonne
  principale d'activité, colonne latérale d'échéances.
- **`appels_offres` n'a aucune colonne de date limite** et l'import depuis la
  veille reçoit `date_limite`/`categorie`/`region` sans jamais les écrire
  (`ao_routes.py:112-121` et `140-190`). Déclaré dans `bugs-connus.md`.
- L'organisation n'a **aucun rôle**. `org_id` est résolu partout par
  `current_user.org_id or current_user.id`, et le propriétaire est identifié par
  `organizations.owner_id` (migration 012). `GET /org/members` gère déjà le cas
  du propriétaire solo dont `users.org_id` est NULL : c'est la seule façon fiable
  de lister les membres, à réutiliser telle quelle.
- Dernière migration Alembic : `013`. Les services sont des dépendances FastAPI
  dans `app/api/dependencies.py` (et non `app/dependencies.py` comme l'indique
  `CLAUDE.md` ; à corriger dans les conventions).
- Aucune notion de tâche, de jalon ou de calendrier n'existe, ni en base ni dans
  les routes.

## Décisions de périmètre

### Les rôles d'organisation sont reportés

`00-overview.md` prévoyait d'introduire un premier rôle dans ce chantier. **Pas
dans cette version**, et la raison est concrète : les tâches et le calendrier
n'ont besoin d'aucune permission nouvelle, alors qu'introduire un rôle oblige à
modifier `POST /org/invite` et `DELETE /org/members/{user_id}`, deux routes en
production, testées en réel le 2026-08-22. Faire porter ce risque par un chantier
dont ce n'est pas l'objet reviendrait à mélanger deux sujets.

Règle appliquée en attendant, identique à l'existant : **tout membre de
l'organisation voit et modifie les tâches de l'organisation**. C'est cohérent
avec le modèle actuel (tout membre peut déjà inviter et retirer, sauf le
propriétaire protégé), et cela ne crée aucune règle à défaire le jour où les
rôles arrivent.

### Ce que le calendrier affiche en v1

Deux sources, aucune saisie supplémentaire obligatoire :

1. la **date limite de remise** des AO de l'organisation (colonne créée par ce
   chantier, voir ci-dessous) ;
2. l'**échéance des tâches**.

Les jalons personnalisés (visite des lieux, réunion, jalon libre) sont un ajout
ultérieur : `00-overview.md` les qualifie lui-même de non prérequis. Aucune table
d'événements n'est donc créée maintenant, pour ne pas figer un modèle avant d'en
connaître l'usage réel.

## Modèle de données

### 1. Migration Alembic `014`, additive

Pattern `try/except pass` idempotent des migrations `007`-`013`.

**`appels_offres.date_limite`** : `String(50)`, nullable, ISO 8601, comme tous les
horodatages de cette table (invariant 5 d'`architecture-context.md`). Renseignée
par `import_from_watcher` (le payload la porte déjà) et modifiable à la main.
Les AO déjà importés restent à `NULL` : la valeur n'a jamais été stockée.

**Nouvelle table `ao_tasks`** :

| Colonne | Type | Rôle |
|---|---|---|
| `id` | `String(36)` PK | uuid4 |
| `org_id` | `String(36)` non nul, indexé | même résolution que partout ailleurs |
| `ao_id` | `String(36)` FK `appels_offres.id`, **nullable** | une tâche peut ne concerner aucun AO |
| `titre` | `String(255)` non nul | |
| `description` | `Text` nullable | |
| `assignee_id` | `String(36)` FK `users.id`, nullable, indexé | non assignée = à prendre |
| `created_by` | `String(36)` FK `users.id`, non nul | |
| `statut` | `String(20)` | `a_faire`, `en_cours`, `faite` |
| `echeance` | `String(50)` nullable | date ISO, ce qui la fait entrer au calendrier |
| `created_at`, `updated_at` | `String(50)` | |
| `completed_at` | `String(50)` nullable | |

Index : `(org_id, statut)` et `(assignee_id, statut)` -- les deux seules requêtes
réelles de l'écran (« les tâches de l'organisation », « mes tâches »).
`ON DELETE CASCADE` sur `ao_id` : supprimer un AO supprime ses tâches, elles
n'ont pas de sens sans lui.

Pas de table de commentaires ni de mentions : hors périmètre v1.

## Endpoints

Nouveau router `app/api/routes/dashboard_routes.py`, monté sous `/api/v1` comme
les autres. Toutes les routes portent `Depends(get_current_user)` et résolvent
`org_id = current_user.org_id or current_user.id`. La logique vit dans
`app/services/task_service.py` et `app/services/dashboard_service.py` ; les routes
ne font que valider, appeler, traduire en HTTP (invariant 4).

### `GET /dashboard/summary`

Les tuiles du haut d'écran, en une requête plutôt qu'en quatre appels comme le
fait `OverviewTab` aujourd'hui (il charge la liste complète des AO, celle de la
veille et l'abonnement pour afficher quatre nombres).

Retourne : nombre d'AO par statut, nombre de tâches ouvertes de l'organisation,
nombre de tâches ouvertes assignées à l'appelant, et la prochaine échéance
(date, libellé, type).

### `GET /dashboard/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD`

Les événements de la période, toutes sources confondues, triés par date :

```
[{ "date": "2026-10-06", "type": "ao_deadline" | "task",
   "titre": "...", "ao_id": "...", "task_id": null,
   "statut": "en_traitement" }]
```

Bornes obligatoires, fenêtre limitée à 92 jours (un trimestre) : sans borne, la
requête ramènerait tout l'historique de l'organisation à chaque ouverture du
mois.

### `GET /tasks`

Filtres : `assignee` (`me`, un `user_id`, ou absent pour toute l'organisation),
`statut`, `ao_id`. Tri par échéance croissante, les tâches sans échéance en
dernier. Pagination `page`/`limit` comme `GET /ao`.

### `POST /tasks`

Corps : `titre` (requis), `description`, `ao_id`, `assignee_id`, `echeance`,
`statut` (défaut `a_faire`).

Deux validations, toutes deux en `400` :
- `assignee_id` doit être un membre de l'organisation, résolu par la même méthode
  que `GET /org/members`, qui traite le cas du propriétaire solo sans `org_id` ;
- `ao_id`, s'il est fourni, doit appartenir à l'organisation.

### `PATCH /tasks/{task_id}` et `DELETE /tasks/{task_id}`

Modification partielle des mêmes champs. Passer `statut` à `faite` renseigne
`completed_at` ; repasser à `a_faire` ou `en_cours` le remet à `NULL`, sinon une
tâche rouverte garderait une date d'achèvement fausse.

`404` si la tâche n'appartient pas à l'organisation de l'appelant, jamais `403`,
qui confirmerait son existence.

### `PATCH /ao/{ao_id}` (route nouvelle)

Il n'existe aujourd'hui aucune route de modification d'un AO. La date limite doit
pouvoir être corrigée à la main : les AO créés manuellement n'en ont pas, et les
AO importés avant ce chantier non plus. Route minimale, limitée à `reference`,
`acheteur`, `objet` et `date_limite`. Les autres champs (`statut`,
`pipeline_pct`, `mode`) appartiennent au pipeline et ne doivent pas être
modifiables de l'extérieur.

## Ce qui n'est pas touché

`AoSummary` gagne `date_limite`, rien d'autre. Le pipeline, ses tâches Celery et
le mode accompagné ne sont pas modifiés par ce chantier : c'est le risque que
`mode-accompagne/api.md` avait identifié comme principal, et il n'y a aucune
raison de le prendre ici.

## Livré le 2026-09-15 (backend)

- Migration `014` : `appels_offres.date_limite` + table `ao_tasks` (index
  `(org_id, statut)`, `(assignee_id, statut)`, `ao_id`, cascade sur l'AO).
- `app/models/task.py`, `app/models/dashboard.py`, `app/services/task_service.py`,
  `app/services/dashboard_service.py`, `app/api/routes/dashboard_routes.py`
  (routers `dashboard` et `tasks`, montés dans `main.py`).
- `date_limite` branchée sur les trois chemins : import depuis la veille, création
  manuelle (`AoCreate`), correction manuelle (nouvelle route `PATCH /ao/{ao_id}`),
  et exposée par `AoSummary`/`AoResponse`.

**Vérifié en conditions réelles, pas par lecture de code :**
- chaîne `001` -> `014` appliquée sur une base jetable, schéma inspecté au `\d`
  (colonnes, index, clés étrangères, cascade), aller-retour `downgrade 013` puis
  `upgrade head` rejoué, base supprimée ensuite ;
- appels HTTP réels avec un vrai jeton : création, lecture, modification,
  suppression d'une tâche ; `completed_at` posé au passage en `faite` et **remis à
  `NULL` à la réouverture** ; `400` sur un assigné hors organisation et sur un AO
  hors organisation ; `401` sans jeton ; fenêtre de calendrier > 92 jours et dates
  invalides en `400` ;
- **cloisonnement vérifié avec un second compte réel** (créé puis supprimé) :
  liste vide, `404` en lecture, modification et suppression d'une tâche d'une
  autre organisation, `400` pour s'assigner à un membre qui n'est pas le sien ;
- **import réel depuis la veille** (AO 4078) : échéance `2026-11-04` identique
  dans la veille, dans la réponse de l'API et en base. AO de test supprimé.

**Piège d'exploitation relevé** : le conteneur `api` ne monte que `app/`, pas
`alembic/`. Une migration nouvellement écrite n'est donc pas visible depuis le
conteneur tant que l'image n'est pas reconstruite (ou le fichier copié à la
main) : `alembic upgrade head` s'arrête silencieusement à la révision précédente.
Constaté ici, la 014 restant ignorée au premier essai.

**Base de dev** : elle n'est pas gérée par Alembic. `ao_tasks` a été créée par le
`create_all` du démarrage, mais la colonne `date_limite` a demandé un
`ALTER TABLE` manuel -- le même piège que `appels_offres.mode` en septembre.

## Check

- Une tâche créée par un membre, assignée à un autre membre réel, apparaît dans
  `GET /tasks?assignee=me` de ce dernier -- vérifié avec deux vrais comptes et
  deux jetons, pas seulement côté créateur.
- Assigner une tâche à un utilisateur d'une autre organisation renvoie `400`.
- Lire ou modifier une tâche d'une autre organisation renvoie `404`.
- Un AO importé depuis la veille après ce chantier a bien sa `date_limite` en
  base, vérifiée par requête SQL directe, et apparaît dans
  `GET /dashboard/calendar` sur le mois concerné.
- La chaîne complète des migrations `001` à `014` s'applique sur une base
  jetable, et le schéma est inspecté au `\d` plutôt que déduit du message de
  succès (deux pannes de ce type en juillet et en septembre).
- Les 6 onglets de réglages existants et le pipeline AO fonctionnent comme avant.

## Questions ouvertes

- **Rôles** : reportés (voir plus haut). À planifier comme un chantier propre,
  qui touchera `POST /org/invite` et `DELETE /org/members/{user_id}`.
- Notification d'une tâche assignée : rien n'est prévu en v1, donc un membre ne
  sait qu'une tâche lui revient qu'en ouvrant l'application. Un email passerait
  par `notification-service` (brique nouvelle) ; à trancher après usage réel.
- Tâches récurrentes, sous-tâches, pièces jointes : hors périmètre, non prévus.
- `CLAUDE.md` indique `dependencies.py` alors que le fichier réel est
  `app/api/dependencies.py` : à corriger dans les conventions au passage.
