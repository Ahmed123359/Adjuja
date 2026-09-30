# Panneau d'administration de la plateforme

Écrit le 2026-09-29, à la demande de l'utilisateur. **Élargi le 2026-09-30**
(l'utilisateur, après avoir vu l'onglet : « l'administration mérite toute une
autre page, bien organisée et séparée », avec tableau de bord, comptes,
abonnements, accès et suivi). Décisions en vigueur :

- **Page séparée `/admin`** (2026-09-30), avec sa propre barre latérale par
  module et des sous-écrans : plus un onglet de l'application, plus une longue
  page à défiler. Lien depuis l'application, retour vers elle.
- **Modules** : Tableau de bord, Comptes et organisations, Abonnements,
  Accès, Veille, Notifications, Santé, Coûts IA, Journal. *Clients et
  abonnements*, écarté le 2026-09-29, est **retenu** le 2026-09-30.
- **Accès** : `ADMIN_EMAILS` (`.env`) seul, adresse vérifiée ; l'écran
  « Accès » l'affiche en lecture seule. Nommer un admin demande un
  redéploiement : une faille web ne peut jamais en créer un.
- **Actions sur les comptes** (2026-09-30) : changer l'offre d'une
  organisation, suspendre / réactiver, suivi d'activité (dernière connexion),
  supprimer un compte. Migration 019 validée : `users.disabled_at`,
  `users.last_login_at`. Les coûts IA passent en migration 020.
- **Ordre** : page + navigation + Veille rangée en sous-écrans, Tableau de
  bord, Comptes et Abonnements ; puis Notifications, Santé, Coûts IA.

## Pourquoi (constaté pendant les sessions du 2026-09-27 au 2026-09-29)

Chaque diagnostic de production est passé par des commandes tapées sur le
serveur : `docker compose logs`, requêtes `psql` à la main, scripts
`enrichir_analyses.py` et `rattraper_details.py`, envoi de démonstration par un
script collé dans le terminal. Deux défauts graves (champs de la veille effacés
à chaque passage, veille quotidienne partant un jour sur deux) ont vécu des
semaines faute d'un écran qui montre l'état réel. Le panneau rend visible ce que
ces commandes allaient chercher, et remplace les commandes d'action.

## Ce qui existe (vérifié dans le code)

| Où | Quoi | Accès |
|---|---|---|
| backend | `settings.admin_emails` : inscription sans vérification ni limite | liste `.env` |
| backend | `POST /billing/admin/activate` (abonnement par virement) | en-tête `X-Billing-Admin-Secret` |
| notification | `POST /admin/trigger`, `POST /admin/send-transactional`, `GET /admin/batches`, `GET /admin/log` | en-tête `X-Admin-Secret` (`settings.notification_admin_secret` côté backend) |
| watcher | `GET /aos/stats`, `GET /bdc/stats` ; **aucune route d'action** | aucune |
| tous | `GET /health` (backend, watcher, notification) | public |
| backend | table `usage` : **un compteur global unique** (jetons, appels, jetons OCR) alimenté par 4 routes | lecture `GET /usage` |

Aucun écran d'administration, aucun indicateur `is_admin` exposé au frontend.

## Architecture retenue

- **Frontend** : domaine `features/admin/`, onglet « Administration » dans
  l'application, affiché seulement si `GET /auth/me` renvoie
  `is_platform_admin: true`.
- **Backend** : `app/api/routes/admin_routes.py`, préfixe `/api/v1/admin`,
  dépendance `require_platform_admin` (email de l'utilisateur courant dans
  `settings.admin_emails`) sur **chaque** route. Logique dans des services
  (`app/services/admin/`), jamais dans les routes.
- **Lecture** : directe en SQL sur les schémas `watcher` et `notifications`
  (même base PostgreSQL, déjà fait par le service de notification et par le
  script d'enrichissement).
- **Actions** : le backend appelle les services concernés avec leur secret
  d'administration. La veille reçoit des routes d'action protégées par un secret
  (`WATCHER_ADMIN_SECRET`), qui lancent des tâches Celery ; les scripts actuels
  deviennent ces tâches, **simulation d'abord** comme aujourd'hui.
- **Traçabilité** : chaque action d'administration est journalisée (qui, quoi,
  quand, résultat).

## Module 1 : Veille (santé des sources)

Par source (marchespublics, safakat, CIMR, bons de commande) :
- dernier passage réussi et son âge ; alerte si plus vieux que 2 intervalles ;
- AO ouverts, nouveaux sur 24 h / 7 j ;
- **taux de remplissage** : estimation, caution, secteur, codes de secteur,
  ville, lien DCE (c'est ce qui aurait révélé l'effacement du 2026-09-29) ;
- AO dont le téléchargement DCE a échoué (`zip_error`), avec le message ;
- analyses : faites, en échec, à enrichir.

Actions : relancer le scrape d'une source ; lancer le rattrapage des détails ;
lancer la ré-analyse enrichie ; chacune en simulation puis en réel, avec suivi
de progression.

## Module 2 : Notifications

- préférences de chaque organisation : activée, secteurs (**alerte si activée
  sans secteur**), cadence, heure, dernier envoi, **prochain envoi prévu** ;
- historique des lots (`notification_batches`) et des envois par organisation ;
- **échecs d'envoi avec le message exact de Resend** (aujourd'hui seulement
  dans les journaux du conteneur : à enregistrer en base) ;
- actions : **envoi de démonstration** à une organisation (sans toucher au cycle,
  comme le script du 2026-09-29), aperçu de l'email dans le navigateur,
  déclenchement d'un lot.

## Module 3 : Santé système et coûts IA

Santé :
- chaque service (backend, veille, notification) : en ligne, version ;
- version des migrations (`alembic_version`) ;
- files Celery en attente par file ;
- erreurs récentes : AO en `erreur`, tâches de remplissage et de signature en
  échec, téléchargements DCE en échec, envois en échec.

Coûts IA : **nécessite une instrumentation qui n'existe pas** (voir ci-dessous).
Par organisation, par jour, par service et par modèle : appels, jetons en
entrée et en sortie, coût estimé ; alerte sur un pic.

### Mesure des coûts : ce qui manque et ce qui est proposé

Aujourd'hui seules 4 routes alimentent un compteur global unique. Ne sont
**comptés nulle part** : l'analyse des AO (veille et application), la note
méthodologique, le remplissage (texte et vision), le fit score (embeddings),
l'assistant par étape. La fonction d'appel de la veille (`core/llm.py`)
**ignore** le nombre de jetons renvoyé par le fournisseur.

**Proposé (migration 018, soumise à validation)** : table `llm_usage`
(horodatage, service, rôle, fournisseur, modèle, organisation ou `NULL` pour la
veille partagée, jetons entrée et sortie, coût estimé, durée, succès). Écriture
à **un seul endroit par service** : le routeur de fournisseurs du backend
(`providers/router.py`) et le client de la veille (`core/llm.py`), plus les
embeddings et la vision. Coût = jetons x tarif du modèle, tarifs dans la
configuration (ils changent). L'organisation est transmise par le contexte de
la requête ou de la tâche.

## Test d'intrusion du serveur (fin de la feature, demande de l'utilisateur)

Exigé le 2026-09-29 : la feature ajoute des routes d'administration et des
actions à distance ; elle ne se clôt qu'après un **test d'intrusion de tout le
serveur de production** (Hetzner, `adjuja.com`), autorisé par son propriétaire.

Périmètre :
- **Surface réseau** : ports ouverts depuis Internet. Relevé préalable dans
  `adjuja-infra/docker-compose.yml` : 8000 (API), 8001 (veille, **sans
  authentification**), 8002 (notifications), 8090 (frontend), **9010/9011
  (MinIO API et console)** publiés sur toutes les interfaces ; Docker contourne
  `ufw`, seul le pare-feu Hetzner peut les fermer (voir `bugs-connus.md`).
- **Web** (`adjuja.com`, `www`) : TLS et en-têtes de sécurité, CORS, fichiers
  exposés, pages d'erreur bavardes.
- **Authentification** : JWT (clé tournée le 2026-09-27, algorithme, expiration),
  limitation de débit, énumération de comptes, OTP (force brute), Google OAuth
  (`state`), inscription sur invitation.
- **Autorisations** : IDOR sur toutes les routes par identifiant (AO, documents,
  équipe, notifications, préférences), séparation des organisations, **routes
  `/api/v1/admin/*` inaccessibles hors `ADMIN_EMAILS`**, secrets d'en-tête des
  services.
- **Fichiers** : téléversements (type réel, taille, noms, chemins), URL
  présignées MinIO (durée, portée), accès direct aux objets.
- **Injection** : SQL (requêtes `text()` des services), HTML des emails, contenu
  des portails réinjecté dans l'interface, prompts (injection via un CPS).
- **Serveur** : SSH (clés seules, pas de mot de passe, pas de root), mises à jour,
  secrets dans le dépôt et les images Docker, ports internes (PostgreSQL, Redis,
  Qdrant) réellement fermés.

Livrable : rapport des failles classées par gravité, chacune corrigée ou
explicitement reportée dans `bugs-connus.md`, puis contre-test des corrections.
Outils d'analyse lancés uniquement contre ce serveur, avec l'accord de son
propriétaire.

## Build order

1. `api.md` : accès (`require_platform_admin`, `is_platform_admin`), routes de
   lecture des trois modules, routes d'action de la veille, enregistrement des
   échecs d'envoi, migration 018 et instrumentation.
2. `client.md` : l'onglet et ses trois écrans.
3. Code dans l'ordre : accès + module Veille ; Notifications ; Santé ; coûts IA
   (le plus long : instrumentation de tous les appels).
4. **Test d'intrusion de tout le serveur**, corrections, contre-test. La feature
   n'est terminée qu'après cette étape.

## Check when the feature is done

- Un compte hors `ADMIN_EMAILS` ne voit pas l'onglet **et** reçoit 403 sur
  toute route `/api/v1/admin/*` (test par route).
- Le taux de remplissage affiché pour une source égale le calcul SQL fait à la
  main ; un effacement comme celui du 2026-09-29 serait visible au premier coup
  d'œil.
- Une organisation activée sans secteur apparaît en alerte.
- Un envoi de démonstration arrive, sans modifier `last_notified_at` ni
  `notification_log`.
- Un échec Resend provoqué (clé invalide en dev) apparaît avec son message.
- Après instrumentation, une analyse d'AO produit une ligne `llm_usage` avec
  jetons et coût ; la somme du jour correspond aux tableaux de bord des
  fournisseurs à quelques pour cent près.

## Open Questions

- Tarifs des modèles : saisis à la main dans la configuration, ou table
  modifiable depuis le panneau ?
- Seuils d'alerte (âge du dernier scrape, pic de coût) : valeurs par défaut à
  proposer dans `api.md`, ajustables ensuite.
- Faut-il notifier l'administrateur (email) sur une alerte, ou seulement
  l'afficher dans le panneau ?
