## Deliverable

Un tableau de bord d'accueil avec calendrier de jalons par AO, tâches
assignables à un membre de l'équipe, mentions (`@nom`) dans les commentaires
d'un AO, et un flux d'alertes in-app -- inspiré du "Tableau de bord" Bidtndr
(tuiles résumé + calendrier mensuel coloré par type d'événement + flux
"Alertes"/"Mes tâches" avec mentions d'équipe).

## Remplacement du dashboard actuel (décidé le 2026-09-12)

L'utilisateur a tranché : ce tableau de bord **remplace** le dashboard actuel,
il ne s'y ajoute pas. Portée réelle de ce que ça implique, vérifiée dans le
code plutôt que supposée :

`DashboardPage.tsx` n'est pas un tableau de bord, c'est une **zone de réglages
à 6 onglets** (`DashboardPage.tsx:2475-2480`) : `overview`, `profile`,
`signature`, `documents`, `equipe`, `generation`. Seul `overview` ressemble de
loin à un tableau de bord (il compte les AO `termine`/`erreur`, lignes 419-420)
et `SubscriptionCard` y est rendu en haut.

Conséquence : remplacer cette page par un vrai tableau de bord oblige à
**reloger les 5 autres onglets**, qui sont du réglage d'entreprise et non de
l'activité -- vraisemblablement dans un espace "Mon entreprise / Paramètres"
distinct. **C'est donc une restructuration de la navigation de l'application**,
pas seulement une page de plus. À cadrer explicitement dans `client.md` :
où atterrissent profil, signature, documents, équipe, génération, et ce que
devient `SubscriptionCard`.

Risque associé : ces onglets contiennent des fonctionnalités en production et
testées en réel (profil entreprise, membres de l'organisation, préférences de
notification rendues dans `ProfileTab`). Les déplacer ne doit pas les casser --
le déménagement est un changement de routage et de mise en page, jamais une
réécriture de leur contenu.

## Depends on

- **Le seul chantier de cette liste qui est entièrement neuf** : l'invitation
  d'équipe et la liste des membres existent déjà (`POST /org/invite`,
  `GET /org/members`, fait le 2026-08-22/23, voir `progress-tracker.md`), mais
  sans rôles (tout membre peut inviter/retirer, sauf le propriétaire protégé)
  et sans aucune notion de tâche/mention/calendrier -- ce chantier construit
  au-dessus de `Organization`/`users.org_id` déjà en place, pas au-dessus de
  rien, mais tout le reste (tâches, mentions, jalons, flux d'activité) est à
  créer de zéro.
- **Rôles d'organisation -- décidé le 2026-09-12** : ce chantier est
  l'occasion d'introduire un premier rôle minimal, et l'utilisateur a validé
  qu'ajouter d'autres rôles ensuite ne pose pas de problème. Jusqu'ici
  l'organisation n'avait aucun rôle (tout membre peut inviter/retirer, seul
  le propriétaire est protégé, voir `progress-tracker.md` 2026-08-22/23) --
  le propriétaire est aujourd'hui identifié par `organizations.owner_id`
  (migration Alembic 012), pas par un champ de rôle. Conséquence : les
  endpoints d'équipe déjà en place (`POST /org/invite`,
  `DELETE /org/members/{user_id}`) devront consulter le rôle au lieu de leur
  règle actuelle "tout le monde sauf le propriétaire", donc ce chantier
  **modifie du code existant et déjà testé en réel**, il ne fait pas
  qu'ajouter. Le jeu de rôles exact et la matrice de permissions sont à
  arrêter en écrivant `api.md`, pas ici.
- Nouvelles tables côté app principale : tâches (assignable à un `user_id`,
  liée à un `ao_id`), mentions (probablement dérivées d'un texte de
  commentaire, pas une table séparée si les mentions ne sont que du texte
  parsé `@nom` sans notification dédiée -- à trancher), jalons/événements par
  AO (au-delà de `date_limite` déjà en base : date de publication, visite,
  réunion, jalon personnalisé).
- Le flux "Alertes" recoupe le système de notification existant
  (`notification-service`, digests email) sans le remplacer -- une alerte
  in-app ("Nouvel appel d'offres pour votre veille...") est un événement
  différent d'un email de digest, mais la même détection de nouveauté
  (`notify_org`) pourrait alimenter les deux, à vérifier plutôt qu'à
  dupliquer la logique de matching secteur.

## Build order

1. `api.md` -- rôles d'organisation (jeu de rôles + matrice de permissions +
   migration, et reprise des endpoints d'équipe existants qui s'appuient
   aujourd'hui sur `owner_id` seul), migration Alembic (nouvelles tables
   tâches/jalons), endpoints CRUD tâches + mentions, endpoint calendrier
   agrégé (jalons tous AO confondus pour l'org).
2. `client.md` -- **remplacement** de `DashboardPage.tsx` par un vrai tableau
   de bord (voir "Remplacement du dashboard actuel" ci-dessus) + relogement
   des 5 onglets de réglage dans un espace dédié, calendrier mensuel, flux
   d'activité, composant de mention dans les commentaires.

## Check when the feature is done

- Une tâche créée sur un AO réel, assignée à un membre réel de l'org, apparaît
  dans "Mes tâches" de ce membre après connexion -- pas juste visible côté
  créateur.
- Une mention `@nom` dans un commentaire notifie réellement le membre
  mentionné (flux in-app minimum, email optionnel selon décision de
  scope).
- Le calendrier affiche au moins la `date_limite` réelle des AO en pipeline
  de l'org sans donnée supplémentaire à saisir manuellement (les jalons
  custom sont un ajout, pas un prérequis pour que le calendrier soit utile
  dès le premier jour).
- Les 5 onglets de réglage relogés (profil, signature, documents, équipe,
  génération) fonctionnent exactement comme avant à leur nouvel emplacement --
  testés en réel un par un, le déménagement étant la principale source de
  régression possible de ce chantier.

## Open Questions

- Notifications de mention : email (nouvelle brique sur
  `notification-service`) ou uniquement in-app pour une première version ?
  Change la portée du `api.md`.
- Ce chantier n'était pas dans la demande initiale (texte), seulement visible
  sur les captures -- confirmé dans le scope par l'utilisateur le
  2026-09-11.
