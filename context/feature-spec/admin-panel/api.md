# Panneau d'administration : API

Écrit le 2026-09-30, sur le code réel (lu le même jour). Complète
`00-overview.md`, dont il suit le build order.

Ce qui demande une validation avant d'être codé est marqué **[à valider]** :
quatre changements de schéma, tous additifs (tables neuves, aucune colonne
existante modifiée).

## 1. Accès

### Défaut préalable à corriger (trouvé en écrivant ce fichier)

`POST /auth/register` crée **immédiatement**, sans code OTP, le compte d'une
adresse de `ADMIN_EMAILS` (`auth_routes.py`, branche `is_admin`). Aujourd'hui
cela donne des générations illimitées à qui s'inscrit le premier avec une
adresse admin non encore inscrite. Avec un panneau branché sur cette liste,
cela donnerait **l'administration de la plateforme**. Correction : les admins
passent par l'OTP comme tout le monde ; `verify_otp` pose `unlimited=True` si
l'adresse est dans la liste. Déclaré dans `bugs-connus.md`.

### Règle

`est_admin_plateforme(user, settings) -> bool` (fonction pure,
`app/services/admin/acces.py`) : adresse du compte dans `settings.admin_emails`
(comparaison sans casse ni espaces) **et** `email_verified` vrai.

- `GET /api/v1/auth/me` renvoie en plus `is_platform_admin: bool` (modèle de
  réponse propre à `/me`, `UserPublic` n'est pas touché).
- Dépendance `require_platform_admin` (`dependencies.py`) : 403
  `Accès refusé.` sinon.
- Posée **sur le routeur** (`APIRouter(prefix="/admin",
  dependencies=[Depends(require_platform_admin)])`) : une route ajoutée plus
  tard est protégée sans qu'on y pense. Un test parcourt toutes les routes du
  routeur et vérifie 401 sans jeton, 403 pour un compte ordinaire.

## 2. Module Veille

### Lecture (backend, SQL direct sur le schéma `watcher`, même base)

`GET /api/v1/admin/veille/sources`

```json
{
  "genere_le": "2026-09-30T10:00:00+00:00",
  "intervalle_heures": 6,
  "sources": [
    {
      "source": "marchespublics",
      "table": "ao",
      "ouverts": 412,
      "nouveaux_24h": 18,
      "nouveaux_7j": 131,
      "dernier_passage": null,
      "remplissage": [
        {"champ": "budget_estime", "ouverts_pct": 71.2, "recents_pct": 74.0, "alerte": false}
      ],
      "dce_en_echec": 3,
      "analyses": {"faites": 40, "a_enrichir": 12}
    }
  ]
}
```

- Sources AO : les valeurs distinctes de `scraped_aos.source`
  (`marchespublics`, `safakat_cdg`, `achats_cimr`) ; plus une ligne `bdc` pour
  `scraped_bdc`.
- **Ouvert** : `date_limite` nulle ou `>= CURRENT_DATE` (même règle que les
  scripts et l'email). Pour les BDC, en plus `est_annule = false`.
- **Nouveaux** : `scraped_at` dans les 24 h / 7 j (date de découverte ; c'est
  la date qu'utilise la sélection des notifications depuis le 2026-09-29).
- **Remplissage**, calculé sur les AO ouverts :
  - AO : `budget_estime`, `caution`, `secteur`, `secteur_codes` (non vide),
    `ville`, `zip_url`, `reference` ;
  - BDC : `categorie`, `nature_prestation`, `ville`, `document_url`.
  - `ouverts_pct` : sur tous les ouverts ; `recents_pct` : sur les ouverts
    découverts dans les 7 derniers jours.
  - **Alerte** si `ouverts_pct < recents_pct / 2` avec au moins 10 AO récents.
    C'est la signature exacte de l'effacement du 2026-09-29 : les AO neufs
    arrivent complets, les anciens se vident à chaque re-scrape. Un seuil
    absolu ne marcherait pas, la caution est légitimement rare.
- **DCE en échec** : `zip_error` non nul parmi les ouverts.
- **Analyses** (AO seulement) : `analyse_json` non nul ; `a_enrichir` via
  `analyse_enrichissement.a_enrichir` (pas de clé `risques`). Les échecs
  d'analyse ne sont enregistrés nulle part aujourd'hui : non affichés, pas
  inventés.
- `dernier_passage` : fin du dernier passage `ok` dans `scrape_runs` ;
  `dernier_essai` : la dernière tentative quelle qu'elle soit (montre une
  source qui échoue depuis son dernier succès) ; `passage_en_retard`. Table
  illisible (veille pas encore redémarrée) : champs vides, la page s'affiche
  quand même.

`GET /api/v1/admin/veille/dce-echecs?source=&limite=50` : AO ouverts avec
`zip_error` (id, source, référence, titre, acheteur, date limite, message).

### Passages de scrape (validé le 2026-09-30, codé)

Aucune trace des passages n'existe : seul l'horodatage du cooldown vit dans
Redis (`scrape:ao:last_run`), écrasé à chaque passage et perdu à un
redémarrage. « Dernier passage réussi » et « la source X échoue depuis deux
jours » sont donc invisibles.

Table `watcher.scrape_runs`, créée par `app/core/schema.py` de la veille
(`CREATE TABLE IF NOT EXISTS`, même mécanisme que la colonne `reference`,
validé le 2026-09-30) :

| colonne | type | |
|---|---|---|
| id | serial | |
| source | varchar(50) | `marchespublics`..., `bdc` |
| debut, fin | timestamptz | |
| statut | varchar(10) | `ok`, `erreur`, `ignore` (cooldown) |
| trouves, enregistres | integer | |
| erreur | text | message tronqué à 2 000 caractères |
| declenchement | varchar(10) | `planifie`, `admin` |

Écrite par `_run_all_sources` (une ligne par source) et `run_scrape_bdc_pipeline`.
Purge des lignes de plus de 90 jours par la tâche de nettoyage quotidienne.
**Alerte** : dernier `ok` plus vieux que 2 x `scrape_interval_hours` (12 h),
ou aucun `ok` alors que la source a déjà été tracée. Une source jamais tracée
n'est pas en alerte (table neuve). Intervalle lu côté backend dans
`WATCHER_SCRAPE_INTERVAL_HOURS` (défaut 6, à garder égal à celui de la veille).

Défaut trouvé en branchant cette trace : la reprise automatique d'un scrape
en échec retombait toujours sur le cooldown d'1 h et ne servait à rien
(`bugs-connus.md`) ; corrigé, une reprise ne repasse plus par le cooldown.

### Actions (routes neuves dans la veille)

La veille n'a aujourd'hui **aucune route d'action**. Ajoutées sous
`/admin/*`, protégées par l'en-tête `X-Admin-Secret` comparé à
`WATCHER_ADMIN_SECRET` (`secrets.compare_digest` ; **secret vide = 403**, jamais
ouvert par défaut). Le backend est le seul appelant ; le port 8001 étant publié
sur Internet (voir `bugs-connus.md`), le secret est la seule barrière tant que
le pare-feu n'est pas posé.

| Veille | Tâche Celery | Paramètres |
|---|---|---|
| `POST /admin/scrape` | `run_scrape_pipeline` / `run_scrape_bdc_pipeline` | `{"cible": "ao" \| "bdc"}` ; le cooldown d'1 h reste appliqué (protège les portails), la réponse dit `ignore` |
| `POST /admin/rattrapage-details` | `rattraper_details` (neuve) | `{"reel": bool, "limite": int?, "source": str?}` |
| `POST /admin/enrichir-analyses` | `enrichir_analyses` (neuve) | `{"reel": bool, "limite": int?}` |
| `GET /admin/taches/{task_id}` | | `{"etat", "progression": {"fait", "total"}, "resultat"}` |

- Le corps des deux scripts passe dans `app/modules/maintenance.py` (fonctions
  `rattraper_details(...)` et `enrichir_analyses(...)` qui **renvoient** un
  compte rendu au lieu de l'imprimer, avec un rappel de progression). Les
  scripts restent, réduits à leur ligne de commande : rien ne change pour qui
  les lance à la main.
- `reel=false` (défaut) : simulation, compte et estime sans lire de page ni
  appeler le modèle, comme aujourd'hui.
- Un seul exemplaire à la fois par action : verrou Redis
  (`admin:tache:<action>`, expiration 2 h). Une deuxième demande reçoit 409.

Backend (proxy, le navigateur ne parle jamais à la veille) :

- `POST /api/v1/admin/veille/actions/{action}` (`scrape-ao`, `scrape-bdc`,
  `rattrapage-details`, `enrichir-analyses`), corps `{reel, limite, source}`
  -> relaie à la veille, journalise (y compris les refus : 409 déjà en cours,
  403 secret différent -> 502, veille injoignable -> 503, non configurée -> 503) ;
- `GET /api/v1/admin/veille/taches/{task_id}` -> relaie l'état ; la première
  lecture qui voit la tâche finie complète le journal.

Configuration backend : `WATCHER_SERVICE_URL` (`http://ao-watcher-api:8001`),
`WATCHER_ADMIN_SECRET`.

**Reporté** : la recopie des analyses dans les AO importés
(`python -m app.scripts.enrichir_analyses` du backend). Opération ponctuelle,
liée au déploiement de l'analyse enrichie : une fois lancée en production elle
n'a plus d'usage, et son script est couvert par `test_enrichir_analyses.py`.
La refaire en tâche Celery coûterait plus qu'elle ne rapporte.

### Journal des actions (validé le 2026-09-30, codé)

Migration Alembic **018**, table `admin_actions` :

| colonne | type | |
|---|---|---|
| id | varchar(36) | |
| created_at, termine_at | varchar(50) ISO | convention des tables existantes |
| admin_user_id, admin_email | varchar | l'email est recopié : il reste lisible si le compte disparaît |
| module, action | varchar(50) | `veille` / `rattrapage-details`... |
| params | jsonb | dont `reel` |
| task_id | varchar(255) | |
| statut | varchar(20) | `lance`, `termine`, `echec`, `refuse` |
| resultat | jsonb | compte rendu de la tâche |

Écrite au lancement ; complétée quand une lecture d'état voit la tâche
terminée. `GET /api/v1/admin/actions?limite=50` la lit.

## 2 bis. Comptes, abonnements, accès, tableau de bord (ajouté le 2026-09-30)

### Unité : l'organisation effective

L'unité de facturation est l'organisation. Un utilisateur seul n'a pas de
ligne `organizations` : son organisation est son id (`org_id or id`, patron de
tout le code). Les listes regroupent donc les utilisateurs par
`COALESCE(users.org_id, users.id)`, jointes à `organizations` et
`subscriptions` sur cette clé. (Deux défauts trouvés en l'écrivant, corrigés :
première invitation qui rendait invisibles les dossiers du propriétaire,
activation d'offre impossible pour un utilisateur seul ; voir
`bugs-connus.md`.)

### Migration 019 (validée le 2026-09-30)

`users.disabled_at VARCHAR(50) NULL` (suspension), `users.last_login_at
VARCHAR(50) NULL` (suivi). ISO 8601 comme les autres dates de `users`.

- **Suspension appliquée partout** : `get_current_user` répond 403 « Ce compte
  est suspendu. » pour un compte suspendu (donc toutes les routes, y compris
  avec un jeton émis avant la suspension) ; la connexion par mot de passe et
  par Google aussi, **après** vérification du mot de passe (pas d'indice pour
  qui ne le connaît pas).
- **Dernière connexion** posée par : connexion par mot de passe, par Google,
  confirmation d'inscription (OTP), acceptation d'invitation.

### Routes (toutes sous `/api/v1/admin`, protégées par le routeur)

- `GET /tableau-de-bord` :
  - comptes : total, nouveaux 7 j / 30 j, actifs 7 j / 30 j (dernière
    connexion), suspendus ;
  - organisations par offre et par statut d'abonnement ;
  - revenu mensuel estimé : somme du tarif mensuel affiché (`plans.py`) des
    abonnements actifs payants, libellé comme tel (hors remise annuelle, hors
    paiements réels : aucun montant n'est enregistré) ;
  - activité : dossiers créés et générations (table `launches`) sur 7 / 30 j ;
  - à surveiller : paiements en retard (`past_due`), échéances sous 7 jours,
    sources de veille en retard, champs en alerte, DCE en échec ;
  - séries quotidiennes sur 30 jours : inscriptions, dossiers créés.
- `GET /comptes?recherche=&offre=&etat=&page=` : organisations effectives
  (nom, propriétaire, membres, offre, statut, échéance, dossiers ce mois et au
  total, dernière connexion d'un membre, suspendue ou non). `etat` : `actif`
  (connexion sur 30 j), `inactif`, `suspendu`. 25 par page.
- `GET /comptes/{org_id}` : fiche : organisation, membres (email, vérifié,
  créé, dernière connexion, suspendu, admin, propriétaire), abonnement et
  consommation face aux limites du plan, dossiers par statut et les 5
  derniers, générations sur 30 j.
- `POST /comptes/{org_id}/offre` `{plan_code, duree_mois}` : `free` =
  rétrogradation (`downgrade_to_free`), sinon `activate(provider="manual")`
  jusqu'à aujourd'hui + `duree_mois` (1 à 24). Remplace, pour l'usage
  courant, la route à secret `/billing/admin/activate` (conservée).
- `POST /utilisateurs/{id}/suspendre` `{raison}` et
  `POST /utilisateurs/{id}/reactiver`. **Refusé** (400) pour soi-même et pour
  une adresse de `ADMIN_EMAILS` : un admin ne peut pas se verrouiller dehors
  ni en verrouiller un autre.
- `DELETE /utilisateurs/{id}` `{confirmation: "<email du compte>"}` :
  **étape suivante**, spécifiée à part avant d'être codée (périmètre exact des
  données, fichiers MinIO, collection Qdrant, préférences de notification).
  Mêmes refus que la suspension, plus : propriétaire d'une organisation qui a
  d'autres membres (les retirer d'abord).
- `GET /abonnements?statut=` : abonnements avec nom d'organisation, offre,
  statut, échéance, fin de grâce, fournisseur.
- `GET /acces` : adresses de `ADMIN_EMAILS` et, pour chacune, le compte
  correspondant (existe, vérifié, dernière connexion) ; liste blanche
  d'inscription (`ALLOWED_EMAILS`) si elle est active. Lecture seule.

Chaque action (offre, suspension, réactivation, suppression) est inscrite au
journal `admin_actions` (module `abonnements` ou `comptes`).

## 3. Module Notifications

La règle du prochain envoi (cadence, heure, `last_notified_at`) vit dans
`batch_tasks.py` du service de notification. La recopier côté backend
créerait deux vérités ; le service l'expose donc lui-même, le backend relaie
et ajoute les noms d'organisation.

Service de notification, routes neuves sous `/admin/*` (`X-Admin-Secret`
existant) :

- `GET /admin/organisations` : par préférence : `org_id`, `enabled`,
  `secteur_codes`, cadence, heure, `last_notified_at`, `prochain_envoi`
  (calculé par la fonction du lot, extraite pour être partagée),
  `alertes` (`sans_secteur` si activée sans secteur, `sans_destinataire` si
  aucune adresse résolue), envois sur 30 jours.
- `GET /admin/apercu/{org_id}` : sujet + HTML + texte du prochain email avec
  les secteurs enregistrés, **sans envoi**.
- `POST /admin/demonstration/{org_id}` : envoie cet aperçu (même règle que
  `test-send` : n'écrit ni `notification_log` ni `last_notified_at`).
  `test-send` et ces deux routes partagent une seule fonction.
- `GET /admin/echecs?limite=50` : voir ci-dessous.

Backend : `GET /api/v1/admin/notifications/organisations`,
`GET /api/v1/admin/notifications/lots` (relaie `/admin/batches`),
`GET /api/v1/admin/notifications/apercu/{org_id}`,
`POST /api/v1/admin/notifications/demonstration/{org_id}`,
`POST /api/v1/admin/notifications/lot` (relaie `/admin/trigger`),
`GET /api/v1/admin/notifications/echecs`. Actions journalisées.

### Échecs d'envoi **[à valider]**

Le message de Resend n'existe que dans les journaux du conteneur. Table
`notifications.send_failures`, créée au démarrage du service (`CREATE TABLE IF
NOT EXISTS`) : `id`, `created_at`, `org_id` (nul pour une newsletter),
`destinataire`, `nature` (`veille`, `test`, `transactionnel`, `newsletter`),
`batch_id`, `code_http`, `message` (tronqué à 2 000). Écrite à **un seul
endroit** : le canal email, quand Resend refuse ou ne répond pas.

## 4. Module Santé

`GET /api/v1/admin/sante` :

- **Services** : `api` (répond, donc en ligne), veille et notification par
  leur `/health` interne, avec la durée de réponse. Aucun service ne publie de
  version aujourd'hui : non affichée (à ajouter par une variable de build
  `APP_VERSION` si l'utilisateur le souhaite, hors de cette feature).
- **Migrations** : révision de `alembic_version` comparée à la tête des
  scripts (`ScriptDirectory`) ; alerte si différente.
- **Files Celery** : longueur des listes Redis `celery_io`, `celery_cpu`
  (backend), `celery` de la veille et du service de notification. URL Redis
  de chacun en configuration (`WATCHER_REDIS_URL`, `NOTIFICATION_REDIS_URL`) ;
  une file injoignable s'affiche comme telle, sans faire échouer la page.
- **Erreurs récentes** (7 jours) : dossiers en `statut = 'erreur'` avec
  `erreur_message` ; `filler_jobs` et `signing_jobs` au statut d'échec ; DCE
  en échec ; échecs d'envoi. Chaque liste limitée à 20, avec le total.

## 5. Coûts IA **[à valider]**, dernière étape

Comme dans `00-overview.md`, avec une correction : la veille n'écrit pas dans
le schéma `public` (chaque service possède son schéma). Deux tables de même
forme, lues ensemble par le backend :

- `public.llm_usage`, migration Alembic **019** ;
- `watcher.llm_usage`, créée par `schema.py` de la veille.

Colonnes : `id`, `created_at`, `service`, `role` (`analysis`, `fast`,
`embeddings`, `vision`), `fournisseur`, `modele`, `org_id` (nul pour la veille
partagée), `jetons_entree`, `jetons_sortie`, `cout_estime` (numeric, USD),
`duree_ms`, `succes`.

Tarifs : dictionnaire par défaut dans la configuration, surchargeable par
`LLM_TARIFS` (JSON) dans `.env` (proposé ; la table modifiable depuis le
panneau reste une question ouverte). Écriture et routes détaillées au moment
de cette étape, après relecture des points d'appel.

## Ordre de code

1. Accès (correction de l'inscription admin, `is_platform_admin`,
   `require_platform_admin`, tests) + lecture Veille. **Sans schéma.**
   *Codé le 2026-09-30 (backend + écran) ; SQL vérifié sur la base de dev le
   même jour (taux égaux au calcul fait à la main).*
2. `scrape_runs`, actions de la veille, journal (018). *Validé, codé et
   vérifié de bout en bout sur la pile de dev le 2026-09-30.* Le journal
   rafraîchit à chaque lecture ses lignes « lancé » (10 au plus), sinon une
   tâche que personne ne suit jusqu'au bout y restait « en cours ».
3. Notifications (routes du service, `send_failures`). *Après validation.*
4. Santé.
5. Coûts IA (019 + `watcher.llm_usage` + instrumentation).
6. Test d'intrusion (voir `00-overview.md`).
