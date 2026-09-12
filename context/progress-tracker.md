# Progress Tracker -- ADJUJA

Remplace `SUIVI.md` (resté figé, voir `ai-workflow-rules.md`). Mettre à jour cette page
dès qu'un changement significatif est fait, pas seulement en fin de session.

## Phase actuelle

Post-lancement, itération continue. Les fondations (auth multi-tenant, MinIO, Redis,
PostgreSQL, pipeline de génération AO) sont terminées. Le travail actuel porte sur la
fiabilisation de la veille (ao-watcher), la mise en prod du service de notifications, et
des corrections ciblées d'UX/scraping.

## Objectif courant

Billing/subscriptions : backend + UI in-app + pricing page -> checkout direct faits (voir
Complété), Pro maintenant self-serve comme Starter (Enterprise seul reste sur devis).
Reste : configurer un vrai compte marchand CMI (rien à coder, juste des variables `.env`)
pour que le checkout fonctionne réellement en prod -- aujourd'hui il répond
"CMI non configuré" (503), comportement attendu tant que ce n'est pas fait.

Notification service fonctionnel en prod mais aucune org n'a encore de préférences
configurées (`enabled=true` + `secteur_codes`) -- aucun email ne part tant que ça n'existe
pas en DB. UI frontend pour gérer `PUT /preferences/{org_id}` construite le 2026-08-20
(voir Complété), reste à ce qu'un premier org réel configure ses préférences via l'UI en
prod pour valider l'envoi bout en bout avec Resend actif.

## Complété (résumé, voir mémoire auto pour le détail complet par sujet)

- **Découpe du dépôt unique en dépôts par service** (2026-09-10, demandé par
  l'utilisateur, référence explicite : le workspace `e-himaya` sur le Bureau). Spec
  complète et décisions dans `context/feature-spec/separation-depots/`.

  Avant : un seul dépôt dont la **racine était le backend** (`app/`, `alembic/`,
  `tests/`, `Dockerfile`, `requirements.txt` au premier niveau), mélangé aux autres
  services et aux documents produit. Après : six dépôts git indépendants, clonés frères
  dans `Adjuja/` qui n'est plus un dépôt -- `adjuja-backend`, `adjuja-frontend`,
  `adjuja-watcher` (ex `ao-watcher/`), `adjuja-notification` (ex `notification-service/`),
  `adjuja-infra` (compose, `.env`, certbot, `scripts/clone.sh`, README d'entrée),
  `adjuja-docs` (conception, business_plan, hafid-taches-docs).

  Décisions prises avec l'utilisateur : le `.git` d'origine descend dans
  `adjuja-backend` (qui hérite donc de l'historique complet, tag `pre-split-2026-09-10`
  sur l'état d'avant) ; les cinq autres dépôts démarrent sur un commit initial, pas de
  `git filter-repo` ; `CLAUDE.md` et `context/` restent **non versionnés** à la racine du
  workspace ; aucun dépôt distant créé pour l'instant (découpe locale uniquement, d'où
  le garde-fou `BASE_URL` non configuré dans `clone.sh`).

  `rag_service/` supprimé : code mort depuis 2026-05-25, référencé par aucun compose.
  Le RAG réel est `app/services/rag_service.py` + le container `qdrant`. Aucun dépôt
  `adjuja-rag` créé, ce serait une promesse vide.

  **Changement de comportement assumé** : `adjuja-backend/Dockerfile` avait une étape
  `frontend-builder` qui buildait le SPA et le copiait dans l'image, monté sur `/ui` par
  `app/main.py`. Un dépôt ne pouvant pas builder le code d'un autre, l'étape est
  supprimée -- `:8000/ui` n'existe plus. Le montage étant conditionnel
  (`if _FRONTEND_DIST.exists()`), l'API démarre sans. L'UI reste servie par le container
  `frontend` (nginx, port 8090), déjà la vraie UI en prod. Bénéfice : fin du double build
  du frontend à chaque image API.

  Piège évité et documenté dans `wiring.md` : `ao-watcher` et `notification-service`
  apparaissent partout dans le code, mais **uniquement** comme noms de service DNS, tags
  OpenAPI, messages de log et commentaires -- jamais comme chemins. En particulier
  `minio_key = f"ao-watcher/{ao_id}/…"` (`download_tasks.py:104,118`) est un préfixe de
  clé d'objet MinIO : le renommer rendrait inaccessibles tous les documents déjà stockés
  en prod. Aucun `sed` global n'a été fait, réécriture fichier par fichier.

  Vérifié réellement : `docker compose config` passe sur les deux fichiers (dev et prod),
  `pytest tests/unit/` passe (14 tests) depuis `adjuja-backend/`, conservation des
  fichiers contrôlée (344 fichiers suivis répartis sur 6 dépôts contre 358 avant, l'écart
  correspond exactement à `rag_service/` supprimé + `CLAUDE.md`/`context/` devenus non
  versionnés). **Non vérifié** : le build Docker réel, Docker Desktop n'ayant pas tourné
  pendant la session (voir Questions ouvertes).

- **Fix menus déroulants coupés dans Profil entreprise + champ Agréments** (2026-08-23,
  signalé par l'utilisateur) : `SectionCard` (`DashboardPage.tsx`) avait `overflow: hidden`
  sur son conteneur racine -- coupait tout menu déroulant absolument positionné qui doit
  sortir des limites de la carte (`CategorieSelect`, `SecteurPicker`, `CustomSelect`).
  Symptôme rapporté ("liste d'activités plus courte que dans Veille") : même donnée,
  même composant partagé (`fetchSecteurs()`), juste coupée visuellement -- Veille utilise
  `FilterSection` (pas de `overflow:hidden`), jamais eu ce bug. Vérifié avant de retirer
  la propriété : le contenu interne a toujours 16px de padding, rien ne touche jamais les
  coins arrondis, donc `overflow:hidden` ne servait à rien visuellement. Nouveau champ
  "Agréments" (`StructuredListField`, domaine + numéro) ajouté juste avant Classifications
  dans la section Qualifications, stocké dans `extra.agrements` (JSONB libre, même pattern
  que classifications/certifications, aucun changement backend). **Non fait, à discuter**:
  `eligibility_service.py` compare déjà `extra.classifications`/`extra.certifications` aux
  exigences extraites du CPS pour le verdict d'analyse d'opportunité -- `agrements` n'y est
  pas encore branché, capturé sur le profil mais pas encore utilisé dans le calcul
  d'éligibilité. `tsc --noEmit` propre.


- **Réinitialisation de mot de passe par email + invitation d'équipe** (2026-08-22/23,
  demande explicite) :
  - **Reset mot de passe** : `POST /auth/forgot-password` (email -> OTP 6 chiffres,
    même infra que l'inscription : Redis 15 min, rate limit, template email) +
    `POST /auth/reset-password` (OTP + nouveau mdp -> `UserService.update_password` +
    connexion auto). Réponse identique email connu/inconnu (pas d'énumération de
    comptes). Vérifié en conditions réelles : email reçu, mauvais code rejeté, bon
    code change vraiment le mot de passe en DB, login confirmé avec le nouveau mdp.
    Nouvelle page `ForgotPasswordPage.tsx`, lien sur `LoginPage`.
  - **Invitation d'équipe** : `POST /org/invite` (vérifie `check_seat_limit`, déjà
    écrit avant mais jamais câblé nulle part -- premier vrai appelant), email avec
    lien (pas OTP, contrairement au reset : c'est quelqu'un d'autre qui donne
    l'accès, pas l'invité qui prouve son identité) via `send_org_invite_email`
    (nouveau template, structure email partagée factorisée en `_link_email_html`/
    `_otp_email_html`). `GET /org/invite/{token}` (preview public) +
    `POST /org/accept-invite` (crée le compte avec org_id = org de l'inviteur) +
    `GET /org/members` + `DELETE /org/members/{user_id}` (détache, org_id -> NULL,
    ne supprime jamais le compte). Emails déjà inscrits refusés proprement (pas de
    fusion de données en v1). Nouvelle page `AcceptInvitePage.tsx`, section
    "Membres de l'organisation" dans `ProfileTab` (inviter + lister + retirer).
    **2 bugs réels trouvés en testant en conditions réelles** (pas en isolation) :
    (1) `users.org_id` a une contrainte FK vers `organizations.id`, une table
    jamais peuplée avant cette feature -- le raccourci `org_id ?? id` utilisé
    partout ailleurs marche pour la LECTURE (jamais stocké), mais écrire un org_id
    explicite sur un membre invité exige une vraie ligne `Organization` à
    référencer. Fix : `UserService.ensure_own_org()` crée la ligne (+ migration
    Alembic 012, `organizations.owner_id` FK vers `users.id`, ajoutée au passage
    car nécessaire pour distinguer "le propriétaire" une fois que son org_id n'est
    plus égal à son propre id) ; (2) ajouter `owner_id` (2e FK vers `users`) a cassé
    la relation SQLAlchemy `Organization.users` (chemins de FK ambigus) --
    `AmbiguousForeignKeysError` en conditions réelles, corrigé avec `foreign_keys`
    explicite des deux côtés de la relation. Sans ce test réel (juste "ça compile"),
    retirer un membre aurait en fait retiré le propriétaire et laissé le vrai membre
    en place -- vérifié avec le fix : propriétaire protégé (400), membre retirable
    (204), compte gardé mais détaché (pas supprimé).
    **Non traité, hors scope demandé** : pas de rôles (tout membre peut inviter/
    retirer d'autres membres, sauf le propriétaire qui est protégé) ; email déjà
    inscrit = invitation bloquée, pas de fusion de données.
    **Point relevé en creusant, pas corrigé (hors scope)** : aucun code de
    `subscription_service.py`/billing ne crée jamais de vraie ligne `Organization`
    non plus -- si un webhook CMI crée un jour un `Subscription` avec
    `org_id = user.org_id ?? user.id` sans org réelle, même violation de FK
    potentielle. CMI n'est pas encore configuré en prod (paiement pas encore live),
    donc pas encore un problème réel, mais à garder en tête le jour où ça le devient.
  - `app/services/jwt_service.py` (nouveau) : `_make_token` dupliqué dans
    `auth_routes.py` extrait en fonction partagée (`create_access_token`), réutilisée
    par `org_routes.py` -- plus de duplication entre les deux fichiers de routes.
  - Nécessite `APP_FRONTEND_URL` dans l'env prod pour que les liens d'invitation
    pointent vers le bon domaine (variable déjà présente dans `settings.py` mais
    jamais utilisée avant, défaut `http://localhost:5173`) -- à ajouter en prod
    sinon les emails d'invitation contiendront des liens vers localhost.
  - `tsc --noEmit` propre.


- **Préférences de notification enrichies (cadence + secteurs indépendants)** (2026-08-20,
  spec dans `context/feature-spec/notification-preferences/`, build order suivi :
  `api.md` puis `client.md`) : `NotificationPreference` gagne `cadence_unit`
  (day/week/month) + `cadence_value`, `send_hour` (0-23, par org, remplace le crontab
  global `settings.notification_hour`/`notification_minute` -- supprimés de `config.py`,
  plus rien ne les référence), `max_items` (remplace le `LIMIT 50` codé en dur) et
  `last_notified_at` (remplace le lookback fixe `NOW() - 24h`). Beat passe d'un crontab
  quotidien fixe à un tick horaire (`crontab(minute=0)`) qui sélectionne les orgs dues
  (heure configurée atteinte ET cadence écoulée depuis `last_notified_at`, ou jamais
  notifiée). `notify_org` ne met à jour `last_notified_at` qu'après un envoi réellement
  réussi (`sent=True`) -- une org sans nouveauté reste éligible au tick suivant plutôt que
  d'être repoussée d'une cadence entière pour rien. `PUT/GET /preferences/{org_id}`
  étendus (Pydantic `Field(ge=..., le=...)` sur les nouvelles bornes), `last_notified_at`
  jamais écrit par ce endpoint (lecture seule, uniquement mis à jour par `notify_org`).
  Pas d'Alembic sur ce service (`init_db.py` gère le schema via `create_all`, jamais
  d'ALTER sur table existante) -- `ALTER TABLE` documenté dans l'en-tête d'`init_db.py`,
  à exécuter une fois par environnement (dev + prod).
  **Bug réel trouvé et corrigé au passage, jamais détecté avant faute de donnée réelle** :
  la requête de matching AO de `notify_org` utilisait `sa.secteur_codes && CAST(:codes AS
  jsonb)` -- `&&` est un opérateur de tableau, pas un opérateur jsonb, il n'existe pas pour
  ce type et lève une erreur SQL à l'exécution (`UndefinedFunction`). Jamais rencontré en
  prod car "0 org avec préférences actives" depuis le lancement (voir plus bas) -- ce
  chemin de code n'avait donc jamais tourné en conditions réelles avant cette session.
  Corrigé en `sa.secteur_codes ?| :codes` (jsonb "contient une de ces clés"), l'opérateur
  correct pour ce type de colonne, compatible avec l'index GIN existant
  (`idx_scraped_aos_secteur_codes`, sans opclass = `jsonb_ops` par défaut, supporte `?|`).
  Frontend : nouvelle section `NotificationPreferencesSection` (component module-scope,
  auto-suffisant comme `SubscriptionCard`) rendue dans `ProfileTab` juste après la section
  "Secteurs d'activité", hors du `<form>` du profil (sauvegarde indépendante, son propre
  bouton). Réutilise `SecteurPicker`/`CategorieSelect` sur un état propre
  (`prefs.secteur_codes`), jamais couplé à `secteurs_interet` du profil -- pré-rempli
  depuis `secteurs_interet` seulement à la toute première configuration (aucune ligne
  préférence existante), sans écriture arrière vers le profil ensuite. `org_id` résolu via
  `getMe()` (`user.org_id || user.id`, même pattern que le backend) -- **gap réel comblé au
  passage** : le type `User` frontend n'avait jamais déclaré `org_id` alors que le backend
  le renvoie déjà sur `/auth/me` depuis le fix multi-tenant de la session billing (bug
  historique jamais remarqué faute d'utilisation client-side jusqu'ici). Proxy
  `/notifications/` ajouté à `nginx.conf` (prod) et `vite.config.ts` (dev), même forme que
  `/watcher/` -- inerte tant que `notification-api` n'est pas défini dans
  `docker-compose.dev.yml` (toujours absent, note existante inchangée, non modifié cette
  session).
  **Vérifié en conditions réelles**, pas juste par lecture de code : DB dev n'avait jamais
  eu le schema `notifications` créé (`init_db.py` reproduit ici le bug déjà documenté --
  schema créé, tables absentes -- contournement SQL manuel identique à celui de prod).
  Image Docker buildée, conteneurs `notification-api`/`notification-worker` lancés à la
  main contre la DB/Redis dev réels : cycle complet `PUT /preferences` (404 avant, valeurs
  cadence/heure/max_items round-trippées après) -> `POST /admin/trigger` -> tick Beat
  simulé (due-check SQL vérifié directement, hors et dans la fenêtre de cooldown) ->
  `notify_org` a réellement matché des AO scrapés réels par code secteur (`FO19`) une fois
  le bug `?|` corrigé -> tentative d'envoi Resend échouée en dev (pas de clé API, attendu,
  chemin `sent=False` confirmé) -> `last_notified_at` confirmé NON mis à jour dans ce cas
  (comportement voulu). Cooldown testé isolément : org non éligible juste après
  `last_notified_at = NOW()`, éligible de nouveau après recul de 2 jours (cadence
  day/1). Frontend : `tsc --noEmit` et `npm run build` propres (chunks >500kB
  pré-existants, pas aggravés). Conteneurs/données de test nettoyés après coup ; les
  tables `notifications.*` restent en place en DB dev (schema à jour, colonnes incluses
  directement puisque créées après la mise à jour du modèle -- pas besoin d'ALTER séparé
  en dev). **Non vérifié** : rendu visuel réel dans un navigateur (aucun outil de capture
  d'écran/browser disponible dans cette session) -- vérifié uniquement par compilation et
  relecture de code, à confirmer visuellement avant mise en prod.

- **Diagnostic réel "Erreur extraction CV" + bug de fusion scraper trouvés en testant en
  local** (2026-08-22, suite à une demande explicite d'arrêter de deviner et de tester
  pour de vrai) :
  - **Cause racine réelle de "Erreur extraction CV"** : `MISTRAL_API_KEY` invalide --
    confirmé en rejouant un vrai upload CV en local avec un vrai PDF et un vrai JWT
    (`client.chat.complete()` lève `mistralai.models.sdkerror.SDKError: Status 401
    Invalid API Key`). Rien à voir avec un bug de code -- clé à vérifier/roter côté
    utilisateur, en local ET en prod (root cause probablement identique dans les deux
    environnements). **Gap réel trouvé au passage** : `staff_cvs_routes.py::
    extract_cv_from_pdf` n'avait aucun `try/except` autour de l'appel Mistral -- toute
    erreur (clé invalide, rate limit, timeout) remontait en 500 brut. Corrigé : catch +
    `HTTPException(502, "Service d'extraction IA indisponible...")`, revérifié en
    conditions réelles (même requête, même clé invalide, réponse propre 502 au lieu
    d'un 500 nu).
  - **Bug réel trouvé en testant le scraper mode_passation en conditions réelles** (voir
    entrée dédiée ci-dessous) : `scrape_tasks.py::enrich()` ne recopiait jamais
    `detail.mode_passation` sur l'objet `ao` avant l'upsert -- même une fois le champ
    correctement extrait par `fetch_detail()`, il aurait été perdu silencieusement à
    chaque scrape réel. Jamais visible en testant `fetch_detail()` isolément (ce que
    j'avais fait avant), seulement en suivant tout le chemin réel jusqu'à l'upsert.
    Corrigé et reverifié : extraction confirmée sur une vraie page live
    (`mode_passation: "Appel d'offres ouvert"` sur l'AO 1028876 réel), filtre API
    confirmé fonctionnel bout en bout (1 résultat exact sur 899 AO après avoir posé la
    valeur manuellement, exclut bien les NULL).

- **Filtre "Mode de passation" (veille AO)** (2026-08-21e, demande explicite) : nomenclature
  officielle marchespublics.gov.ma (28 entrées, extraites verbatim du vrai HTML du
  formulaire de recherche avancée le 2026-08-21 -- `ao-watcher/app/core/mode_passation.py`,
  même pattern que `nature_prestation.py`, apostrophes droites/courbes incohérentes de la
  source volontairement préservées telles quelles). **Gap réel trouvé en creusant** : le
  config JSON du scraper (`marchespublics.config.json` et les 2 autres portails) mappait
  déjà `"procedure": "typeProcedure"` dans `detail.fields` depuis le début, mais
  `MPEPlatformScraper.fetch_detail()` ne lisait jamais ce champ ni ne le renvoyait --
  exactement la même classe de bug que d'autres trous trouvés ce soir (config déclare,
  code ignore). Corrigé : `AoData.mode_passation` (nouveau champ) alimenté via
  `get_field("procedure")`, un seul scraper pour les 3 portails donc un seul fix couvre
  tout. Uniquement disponible via la page détail (pas la page listing) -- même
  traitement que `ville`/`date_publication` dans `AoRepository.upsert_many` : `COALESCE`
  à l'upsert pour ne jamais écraser une valeur déjà enrichie par un re-scrape listing-only.
  Chaîne complète : colonne `watcher.scraped_aos.mode_passation` (+ index), filtre
  `AoRepository.list_aos(mode_passation=...)` (égalité stricte, pas `ilike` -- valeur
  fixe de nomenclature, pas texte libre), nouvel endpoint public `GET /aos/mode-passation`
  (pas d'auth, donnée de référence statique, même pattern que `/secteurs`), filtre
  `CustomSelect` dans `VeilleFilters.tsx` positionné juste avant "Catégorie principale"
  comme demandé. Pas d'Alembic sur ao-watcher (même limitation que notification-service)
  -- `ALTER TABLE` manuel documenté dans l'en-tête d'`init_db.py`, à exécuter une fois
  par environnement. **Backfill non fait** : les ~1000+ AO déjà scrapés n'auront
  `mode_passation` qu'après un nouveau passage sur leur page détail -- le filtre ne
  montrera des résultats que pour les AO scrapés/re-enrichis après ce déploiement, pas
  rétroactivement, sauf décision explicite de relancer un enrichissement complet
  (implique de re-taper la charge sur le vrai portail gouvernemental, pas fait sans
  validation). `tsc --noEmit` + `py_compile` propres.

- **Bug systémique `res.json()` avant `res.ok` (bloc CV/Équipe)** (2026-08-21e) : même
  classe de bug que celui corrigé plus tôt côté notifications, trouvé en investiguant un
  vrai rapport utilisateur ("Unexpected token '<'..." sur l'onglet Équipe en prod) --
  `fetchStaffCvs`/`createStaffCv`/`updateStaffCv`/`deleteStaffCv`/`uploadCvPdf`/
  `fetchAoTeam`/`extractCvFromPdf` dans `api.ts` appelaient toutes `res.json()` avant de
  vérifier `res.ok`. Root cause exacte de l'occurrence signalée non confirmée avec
  certitude (logs `api` ne montrent aucune trace de la requête `staff-cvs/extract` au
  moment de l'échec -- nginx a renvoyé un 500 avant même de proxifier, corrélé à un
  upload démarré depuis un mobile Android d'après le user-agent du log nginx, hypothèse
  de connexion coupée en cours d'upload, pas confirmée à 100%). Le fix ne résout donc pas
  forcément la cause racine de cet incident précis, mais transforme toute future
  occurrence similaire (erreur réseau, page d'erreur HTML, timeout) en message clair au
  lieu d'un crash JS brut. `tsc --noEmit` propre.

- **Design carte AO du digest revu + bug de domaine corrigé** (2026-08-21d, retour direct
  de l'utilisateur -- "clairement généré par IA") : `_AO_CARD` (`ao_digest.py`) refaite en
  liste éditoriale (titre + une ligne meta muette acheteur/catégorie + une ligne
  référence/date/lien séparées par des points médians, hairline `border-top` entre
  éléments) au lieu de boîtes bordurées avec étiquette majuscule colorée ("TRAVAUX") et
  grille Référence/Date en deux colonnes façon composant de dashboard -- exactement les
  patterns listés comme signal IA dans `context/ui-context.md` (eyebrow label, carte à
  accent coloré, grille de stats). **Bug réel corrigé au passage** : tous les liens du
  template pointaient vers `https://app.adjuja.com/...` (sous-domaine qui n'existe pas)
  au lieu de `https://adjuja.com/app` (un seul domaine, l'app est sur un chemin, pas un
  sous-domaine) -- CTA, lien "Gérer mes préférences" et texte brut, 3 occurrences. Non
  re-vérifié par un envoi réel cette fois : la stack Docker dev locale (postgres/redis/
  api/...) a disparu entre les deux sessions (probablement un `docker compose down` ou
  reset Docker Desktop côté utilisateur, sans rapport) -- `py_compile` propre, à valider
  visuellement directement en prod après déploiement.

- **Référence AO ajoutée au digest de notification** (2026-08-21c) : `AoItem.reference`
  (nouveau champ, `notification-service/app/templates/ao_digest.py`) alimenté par
  `watcher.scraped_aos.external_id` (le refConsultation numérique du portail source, ex.
  `1032869` -- pas de colonne `reference` dédiée, `external_id` est la donnée réellement
  équivalente, déjà exposée côté frontend `types.ts` mais jamais affichée nulle part).
  Affiché dans la carte AO du digest (colonne "Référence" à côté de "Date limite") et
  dans le texte brut. `notify_org` (batch réel) et le nouvel endpoint `test-send`
  alimentent tous deux ce champ (même `SELECT ... sa.external_id` ajouté aux deux
  requêtes). Vérifié en conditions réelles : nouvel envoi de test via `/test-send`,
  email reçu avec la référence affichée.

- **Renommage produit "Go/No-Go" -> "Analyse d'opportunité"** (2026-08-21b, demande
  explicite) : toutes les occurrences visibles côté utilisateur/robots (fr.json + en.json
  -- titre de la carte fonctionnalité, tagline footer, subtitle auth showcase, hint
  qualifications profil ; `frontend/index.html` -- meta description, OG, Twitter,
  JSON-LD description/featureList/FAQ) remplacées. En anglais, traduit en
  "Opportunity analysis" plutôt que de garder le terme français. **Volontairement non
  touché** : identifiants de code (`GoNoGoMockup`, commentaire `{/* B - Go/No-Go */}`
  dans `FeaturesSection.tsx`), le badge "GO"/score dans le mockup (verdict, pas le nom
  de la fonctionnalité), tout le backend (`eligibility_service.py`, `ao_routes.py`,
  `analysis.py` côté ao-watcher -- docstrings/commentaires internes jamais vus par un
  utilisateur, champ `verdict` reste `go`/`no_go` en DB). Clé i18n morte
  `veille.tabGoNoGo` repérée (plus référencée nulle part dans le code, valeur déjà
  "Analyse") -- laissée telle quelle, hors scope. `tsc --noEmit` + JSON validés.

- **Contre-audit site : vérification des 4 chantiers restants** (2026-08-21, rapport
  source `Adjuja_Contre_Audit_Site_Developpeur.docx`) : 2 des 4 chantiers marqués
  "critiques" par le rapport (métadonnées HTML servies, sitemap pointant vers
  `offria.cloud`) étaient en réalité déjà résolus en prod au moment de la vérification --
  confirmé en interrogeant `https://adjuja.com` directement (title/description/OG/Twitter
  corrects, aucune balise `keywords`, `maximum-scale` déjà retiré, sitemap ne référence
  plus `offria.cloud`). Le rapport datait sa vérification du 18 août ; le commit
  `b38e772` (16 août) avait déjà appliqué le correctif, probablement pas encore propagé
  en prod au moment exact de l'audit. **Bug réel trouvé au passage, absent du rapport** :
  `frontend/nginx.conf` ne déclare aucun `charset` -- `Content-Type: text/html` part sans
  `charset=utf-8`, les accents ne sont interprétés correctement que parce que les
  navigateurs retombent sur la balise `<meta charset>` interne ; un outil qui lit le
  header HTTP en premier (certains bots) verrait du mojibake. Corrigé (`charset utf-8;`
  ajouté au bloc `server`).
  **Chantiers réellement corrigés cette session** : sitemap.xml complété avec les 3 pages
  légales (seule la home y figurait) ; noms d'organismes publics réels
  (« Commune urbaine de Kénitra », « ONEE - Branche Eau », « Région Rabat-Salé-Kénitra »)
  trouvés dans `HowItWorksSection.tsx::CardVeille` (pas dans `FeaturesSection.tsx` où
  l'audit semblait les situer -- la maquette de cette section-là n'affiche pas
  d'acheteur) remplacés par des libellés génériques ; 2 des 3 fautes résiduelles
  corrigées (« criteres »/« evidence » et « redaction » sans accents dans
  `HowItWorksSection.tsx` -- la 3e, « ETAPE 01/03 », introuvable dans le code actuel,
  déjà résolue avant cette session) ; ancrage tarifaire 56 MAD → 45 MAD (`dayAnchor`,
  fr.json ET en.json -- le calcul erroné existait aussi côté anglais, non signalé par le
  rapport) ; texte du footer newsletter (`footer.tagline`) repositionné de
  "automatise la rédaction" vers le discours copilote, fr et en.
  **Laissés en décision utilisateur, pas auto-corrigés** : (1) crédit agence "Made by"
  Continuium en pied de page (`LandingFooter.tsx`) -- relation contractuelle possible
  avec l'agence, pas une décision technique ; (2) imagerie Terre/Lune de la hero section
  vs. charte de marque (cartes d'Afrique/architecture marocaine) ; (3) compteur
  "656 AOs surveillés" (`AuthLayout.tsx`) -- vérifié : c'était un chiffre réel à un
  moment donné mais périmé, la base compte aujourd'hui 1028 AO (dev, prod probablement
  proche ou supérieur) -- à mettre à jour ou brancher en direct, pas à retirer comme le
  suggérait le rapport en cas de doute.
  **Canonical dynamique par page** (seul point du rapport non traité) : nécessiterait un
  SSR/prérendu réel pour être visible des robots (le rapport le note lui-même comme
  "solution de fond", pas requise pour le lancement) -- laissé tel quel (canonical fixe
  sur `https://adjuja.com` pour toutes les routes), un correctif JS-only n'aurait rien
  réglé côté crawlers, exactement le problème que le chantier n°1 dénonçait.
  `tsc --noEmit` propre, JSON locales et sitemap.xml validés.

- **Refonte templates email (digest AO + OTP) + bouton test d'envoi local** (2026-08-20b) :
  les deux templates HTML (`notification-service/app/templates/ao_digest.py`,
  `app/services/email_service.py::send_verification_otp_email`) refaits avec un vrai
  en-tête logo (`https://adjuja.com/logo-adjuja.png`, dégradé tricolore ADJUJA en fond),
  preheader caché pour l'aperçu boîte de réception, mêmes tokens de couleur que le design
  system. **Bug de grammaire française corrigé au passage** : le sujet/corps du digest
  AO avait un double espace et un mauvais accord pluriel (`nouvels` au lieu de
  `nouveaux`), résidu visible d'un ancien em-dash retiré sans recomposer la phrase --
  remplacé par des segments entièrement calculés en Python (singulier/pluriel explicites)
  plutôt qu'une concaténation de suffixes. Liens `/settings/notifications` et `/veille`
  (routes qui n'existent pas dans ce SPA, l'onglet profil est un simple `useState` non
  synchronisé à l'URL) corrigés vers `https://app.adjuja.com/app`, la seule route réelle.
  Nouveau bouton "Envoyer un test" dans `NotificationPreferencesSection` (dashboard) :
  nouvel endpoint `POST /preferences/{org_id}/test-send` (JWT, pas de secret admin) qui
  envoie un vrai digest immédiat aux secteurs actuellement dans le formulaire (pas besoin
  d'avoir sauvegardé), sans lookback de cadence ni dédup `notification_log` -- n'écrit
  jamais `last_notified_at`, donc n'affecte jamais le vrai cycle de notification.
  **Deux bugs réels trouvés en testant en conditions réelles** (jamais détectés avant
  faute d'un point d'entrée API qui les exerçait) : `TemplateRegistry` et
  `NotificationChannelFactory` ne sont peuplés qu'à l'import de `celery_app.py` (le
  worker) -- le process API (`main.py`) ne les avait jamais importés, donc tout appel à
  `TemplateRegistry.get()`/`NotificationChannelFactory.create()` depuis une route FastAPI
  levait une erreur (`ValueError`, registres vides). Corrigé en importable/enregistrant
  les deux dans `main.py` au démarrage, même pattern que `celery_app.py`. Vérifié
  bout en bout en conditions réelles : `POST /test-send` a réellement envoyé un email
  (template digest complet, logo inclus) à une adresse réelle via Resend
  (`sent:true, ao_count:3`, confirmé par les logs `notification-api`) ; template OTP
  vérifié par exécution réelle de `send_verification_otp_email` (httpx mocké pour ne pas
  envoyer un vrai email, HTML généré inspecté -- contient bien le code et l'URL du logo,
  aucune erreur de f-string).

- **Billing & Subscriptions** (2026-07-18, feature-spec complet dans
  `context/feature-specs/01-billing-subscriptions/`) : `Plan` config (free/starter/pro/
  enterprise, limites mappées 1:1 sur les cartes de la page pricing) + tables
  `subscriptions`/`billing_events` (migration Alembic 010) + `SubscriptionService` (source
  de vérité unique, jamais d'appel live au provider) + `PaymentProvider` (Strategy, même
  forme que les providers LLM) avec `ManualProvider` (Pro/Entreprise, sales-assisted) et
  `CMIProvider` (Starter self-serve, squelette hosted-page+HMAC env-driven, champs exacts
  non confirmés contre la vraie doc CMI -- voir Questions ouvertes). Enforcement câblé en
  `402` sur `create_ao`/`from-watcher` (cap AO/mois) et `upload_document` (cap documents).
  Celery Beat quotidien (06h00, nouveau service `celery-beat`, n'existait pas avant pour
  l'app principale) : dunning avec grâce 5j puis downgrade vers `free`, email de relance via
  un nouvel endpoint minimal `POST /admin/send-transactional` sur notification-service
  (réutilise `NotificationChannelFactory` existant, pas de nouveau template). **Bug corrigé
  au passage** : `UserService._to_public` n'assignait jamais `org_id` -- tout utilisateur
  retombait silencieusement en org solo (`current_user.org_id or current_user.id` résolvait
  toujours vers `.id`), cassant tout multi-tenant réel avant ce fix. Vérifié : app complète
  démarre (87 routes), 5 routes billing chargent, providers s'instancient, `tsc --noEmit`
  frontend propre, suite pytest inchangée (6 échecs pré-existants confirmés identiques avant/
  après via `git stash`).
- **Billing : UI in-app** : `SubscriptionCard` (nouveau composant dans `DashboardPage.tsx`,
  affiché en haut de l'onglet Vue d'ensemble) -- plan/statut, barres d'usage AO-par-mois et
  documents, date de renouvellement, bouton "Passer à Starter" (visible seulement si
  `plan_code === "free"`) qui appelle `startCheckout("starter")` et redirige vers
  `redirect_url`, erreur affichée inline si CMI n'est pas configuré. i18n complet FR/EN
  (`dashboard.billing.*`). Suit exactement les conventions déjà en place dans ce fichier
  (style inline + `var(--l-*)`, pas Tailwind -- c'est la convention réelle de ce fichier
  précis, pas une exception). `tsc --noEmit` propre.
- **Billing : pricing page -> checkout direct** (pattern SaaS standard, demandé
  explicitement) : le bouton "Commencer" du plan Starter sur la landing publique
  (`PricingSection.tsx`) ne se contente plus d'ouvrir l'app. Connecté (`getToken()` non
  vide) -> appelle `startCheckout("starter")` et redirige immédiatement, sans passer par le
  dashboard. Pas connecté -> l'intention est mémorisée (`CHECKOUT_INTENT_KEY` dans
  `localStorage`, constante exportée depuis `api.ts`) puis consommée une seule fois dans
  `main.tsx::handleAuthSuccess` juste après login/register réussi, avant la redirection vers
  `/app` -- l'utilisateur qui clique Starter sans compte atterrit directement sur CMI après
  s'être inscrit, pas sur le dashboard à devoir re-chercher le bouton. Échec (CMI non
  configuré) -> repli silencieux vers l'app normale, où `SubscriptionCard` explique l'erreur.
  `tsc --noEmit` propre.
- **Pro passé en self-serve, Enterprise seul reste sur devis** (2026-07-18b, décision
  produit explicite) : `SELF_SERVE_PLAN_CODES = ("starter", "pro")`, prix Pro fixé à
  **299 MAD/mois (239 annuel)**. Risque identifié et traité : Pro combine génération
  "illimitée" + providers premium (GPT-4o/Claude, plus chers au token que Mistral) +
  signatures illimitées -- en self-serve, plus de filtre humain avant l'activation d'un
  compte à ce profil de coût. Fix : `Plan.max_ao_per_month` pour `pro` = **300** (plafond
  fair-use réel, pas vraiment illimité), ~10x l'usage réel attendu ("plusieurs AOs par
  semaine"), invisible pour un vrai client, protège l'exposition coût dans le pire cas.
  Marketing toujours "AOs générés illimités" (`f_ao_illimite`) -- pratique SaaS standard
  (illimité soft-cappé), pas trompeur vu la marge.
  **Bug réel corrigé au passage** : l'encodage `order_id` de `CMIProvider` était
  `sub-{org_id}-{random}` splitté sur `-`, mais `org_id` est un UUID plein de tirets
  internes -- `parse_webhook` n'aurait récupéré que le premier segment de l'UUID, activant
  le mauvais org ou aucun. Pas de moyen non plus de savoir quel plan avait été acheté
  (`plan_code="starter"` en dur, seule option self-serve à l'époque). Fixé : délimiteur `__`
  (absent des UUIDs et des codes de plan) + plan encodé :
  `sub__{plan_code}__{org_id}__{random}`. Vérifié bout-en-bout avec un UUID complet.
- **Méthodologie trace/spec-driven** (2026-07-18) : `context/` à la racine (déplacé depuis
  `conception/context/` par l'utilisateur), `ai-workflow-rules.md` + `progress-tracker.md`
  (ce fichier) + `feature-specs/` maintenant utilisé pour de vrai (premier cas : billing).

- **Phases 1-3** : multi-tenant, MinIO, Redis, PostgreSQL, migrations Alembic 001-004.
- **Phase 4 -- Pipeline AO "Minimal Clicks"** : upload CPS/RC -> dossier complet signé en
  ZIP, orchestré via chaîne/chord Celery (`task_classify_uploads` -> `task_analyze_ao_context`
  -> `task_build_pipeline` -> chord(`task_generate_note_metho`, `task_fill_documents`) ->
  `task_sign_and_compile` -> `task_index_results`). Détail dans `architecture.md`.
- **Phase 5 UI** : refonte Tailwind complète (landing + app), palette officielle extraite
  du logo (`#3248CE`/`#2B79E8`/`#1BC9A8`/`#080B1C`), CSS vars uniquement.
- **AO Watcher (veille)** : scraper `MPEPlatformScraper` unique piloté par config JSON pour
  3 portails MPE (marchespublics.gov.ma, safakat.cdg.ma, achats.cimr.ma). 656 AOs en base
  au dernier scrape confirmé (644 + 11 + 1). `date_publication` et `ville`/localisation
  fonctionnels dans le listing ET le détail depuis 2026-07-05 (bug de coalesce sur upsert +
  `enrich()` qui n'assignait jamais `ao.ville`, corrigés). Cooldown anti-ban Redis (TTL 1h)
  sur les deux scrapers (AO + BDC).
- **BDC Watcher (2e source)** : module parallèle `bdc_scraper`, table séparée
  `watcher.scraped_bdc`, scraper httpx+BS4 (Symfony, pas ASP.NET). `nature_prestation`
  classifiée et filtrable en multi-select.
- **Filtrage par secteur d'activité** : nomenclature officielle marchespublics.gov.ma
  (46 domaines, migrée de Sodipress le 2026-06-28), `secteur_codes` JSONB+GIN sur
  `scraped_aos`, `SecteurPicker.tsx`, pensé pour être réutilisé par le service de
  notifications.
- **Go/No-Go éligibilité** : analyse CPS/RC (ao-watcher) + verdict pur Python (app
  principale), profil entreprise étendu (classifications/certifications/références).
- **Notification service** (port 8002, microservice isolé) : Factory+Adapter channels
  (Resend), TemplateRegistry, batch Celery en chord/group avec déduplication
  (`notification_log` UNIQUE org_id+ao_id), trigger event-driven depuis ao-watcher après
  chaque scrape + fallback Beat quotidien 08h00. JWT réel + IDOR corrigés (2026-07-02).
  DNS Resend configuré sur `adjuja.com` (2026-07-04). **Mis en route en prod le
  2026-07-05** : `docker-compose.yml` prod avait déjà les 3 services (api/worker/beat)
  mais le schema `notifications` n'existait pas -- `init_db.py` annonçait un succès sans
  réellement créer les tables (cause exacte non identifiée, `create_all` silencieux),
  contournement par SQL direct (`CREATE TABLE IF NOT EXISTS` manuel pour les 3 tables).
  Batch testé et fonctionnel (`{'batch_id': 1, 'orgs': 0}`), 0 org avec préférences actives.
- **Outils en tâches de fond** (2026-07-05) : signature, paraphe, remplissage de documents
  passés en tâches Celery avec état Redis (TTL 24h), polling frontend, bouton "Arrêter",
  persistance localStorage pour survivre à la navigation d'onglet. `FillerTab.tsx` et
  `DocumentsTab.tsx` migrés ; `ParapheTab.tsx` et `RemplissageTab.tsx` encore sur
  l'ancienne API synchrone (voir Questions ouvertes).
- **MinIO presigned URLs** (2026-07-05) : bug `SignatureDoesNotMatch` -- le hostname était
  réécrit après signature HMAC. Fix : `_public_client()` séparé initialisé directement avec
  l'endpoint public + `region` explicite (évite un appel réseau `GET /bucket?location=`
  bloquant côté container).
- **Audit sécurité** (2026-07-02) : 10 vulnérabilités corrigées (JWT bypass
  notification-service, IDOR préférences, 3 endpoints ao-watcher sans auth via nginx, 3
  routes backend principal sans `get_current_user`, magic bytes PDF, path traversal
  filename, CORS wildcard, 3 appels frontend sans `authHeaders()`). Rapport :
  `conception/security-audit.md`.
- **Audit performance** (2026-07-02) : 9 problèmes, 7 corrigés en code (double session DB,
  polling backoff adaptatif, pagination `list_ao`, UPSERT atomique UsageService, index
  `verification_token`, limite `list_summaries`), 2 via migration SQL (GIN tsvector +
  partial index newsletter). Rapport : `conception/performance-audit.md`, migration dans
  `conception/migrations/perf_indexes.sql` (à exécuter une seule fois en prod si pas déjà
  fait).
- **Footer landing** (2026-07-05) : téléphone `+212 661-396413`, adresse `Temara, Maroc`,
  navigation réduite aux liens réellement existants (Blog/Contact/Légal retirés).
- **Audit site adjuja.com, remédiation B1-B8 partielle** (2026-08-13, rapport source
  `hafid-taches-docs/audit-strategy/Adjuja_Audit_Site_Web.docx`) :
  - B2/I5 : grille repriced Essentiel 490 / Pro 990 / Cabinet 2900 MAD (392/792/2320
    annuel), `enterprise` passe self-serve (`SELF_SERVE_PLAN_CODES`), détail complet et
    justification dans `context/feature-specs/01-billing-subscriptions/api.md` (révision
    2026-08-12). I5 (contradiction "50 AOs/mois" + "Génération illimitée" affichées
    ensemble sur la carte Essentiel) corrigé le 2026-08-13 : `f_unlimited_gen` retiré de
    `starterFeats` (Essentiel a un vrai plafond dur à 50, pas d'"illimité" à afficher) et
    dédupliqué de `proFeats` (redondant avec `f_ao_illimite`, même claim).
  - I4 (mention nominative des providers LLM sur la page tarifs) : déjà corrigé avant
    cette session, `f_providers` lit "Rédaction assistée par IA" sans nommer
    GPT-4o/Claude/Mistral. Les noms de providers restent visibles dans
    `settings.providers.*` (écran authentifié de choix de modèle), ce qui est légitime,
    seule la page marketing publique était concernée par I4.
  - B5 : `--l-text-dim` (index.css, palette landing) était #3D5278 sur fond #080B1C, ratio
    ~2.5:1, illisible -- corrigé à #8CA0BC (~7.8:1, WCAG AA), corrige d'un coup footer +
    labels FeaturesSection + tout usage `var(--l-dim)`. Plus 3 rgba hardcodés
    (PricingSection : toggle mensuel/annuel, unités "MAD/mois", footnote) migrés vers ce
    même token. Fallback `color:#fff` ajouté sur le gradient-clip-text des gros chiffres
    (Card Analyse, HowItWorksSection) au cas où `background-clip:text` ne s'applique pas.
  - B7 : 3 champs de qualification à l'inscription (entreprise, secteur_activite,
    nb_ao_par_an) -- migration Alembic `011_user_qualification_fields.py`, colonnes sur
    `users`, `UserCreate`/`UserPublic` étendus, `RegisterPage.tsx` avec select secteur
    (12 options, indépendant de la nomenclature `SecteurPicker`/ao-watcher, volontairement
    plus simple pour un formulaire public). Vérifié end-to-end (POST /auth/register réel,
    ligne vérifiée en DB).
  - B8 : 3 pages légales créées et routées (`/mentions-legales`, `/cgu`,
    `/confidentialite`), contenu complet en FR/EN via i18n (`locales.legal.*`), charte
    d'engagements (6 points, loi 09-08) intégrée à la page confidentialité avec ancre
    `#charte-donnees`. Case à cocher obligatoire (CGU + confidentialité) sur
    `RegisterPage.tsx`, bouton submit désactivé tant qu'elle n'est pas cochée. **Mentions
    légales volontairement incomplètes** : pas de RC/ICE/capital social/hébergeur -- la
    société n'est pas encore immatriculée à ce stade, demande explicite de l'utilisateur de
    ne pas fabriquer ces informations. À compléter dès l'immatriculation faite.
  - Effet de bord : le port hôte Postgres du compose dev est passé de 5432 à 5434
    (`docker-compose.dev.yml` + `.env`) -- 5432 était pris par `aurs_postgres_dev`, un
    autre projet local sur la même machine. Le réseau Docker interne (`postgres:5432`,
    utilisé par les autres conteneurs du compose) est inchangé.
  - **Réécriture homepage (section 6 du rapport), 2026-08-13** :
    - **B3 corrigé pour de vrai** : `FeaturesSection.tsx` (les "4 modules") existait déjà en
      code mais n'était importé nulle part dans `LandingPage.tsx` -- section entièrement
      invisible sur le site réel. Rien de ce que contenait ce fichier n'avait donc d'effet
      tant qu'il n'était pas câblé. Corrigé : import + rendu ajoutés, et son contenu
      remplacé (Suivi/Pipeline -> Veille/Go-No-Go, avec 2 nouveaux mockups `VeilleMockup`/
      `GoNoGoMockup`) pour que veille et Go/No-Go, jusque-là absentes de tout le site
      (constat B3), soient enfin visibles.
      Slots : A=Veille, B=Go/No-Go (nouveaux), C=Analyse CPS (`DocMockup` réutilisé),
      D=Rédaction (`WritingMockup` réutilisé).
    - 6.1 Hero : `HeroSection.tsx` n'avait aucun appel `t()` (texte 100% en dur) et son CTA
      pointait vers `onEnterApp` (login) au lieu de `onGoRegister` -- nouveaux visiteurs
      envoyés vers un formulaire de connexion. Copie reprise mot pour mot du rapport
      (6.1), CTA corrigé vers l'inscription. Clés déplacées vers `landing.hero.*` (arbre
      i18n réellement utilisé par les composants actifs, pas le `hero.*` top-level qui
      s'est révélé lui aussi orphelin -- deux arbres i18n parallèles existaient déjà dans
      ce fichier avant cette session, non nettoyés, seul celui utilisé a été touché).
    - 6.4 Comment ça marche : 3 étapes reformulées mot pour mot (rapport), la carte de
      l'étape 1 changée de "Analyse" vers "Veille" (nouveau composant) pour matcher le sens
      du nouveau texte, `CardExport` supprimé (plus référencé).
    - 6.5 Bloc confiance : nouvelle section `TrustSection.tsx`, 6 engagements repris tels
      quels du rapport, lien vers `/confidentialite#charte-donnees`. Placée avant les
      tarifs comme demandé.
    - 6.6 Tarifs : ligne d'ancrage ajoutée ("Pro revient à ~56 MAD/jour ouvré, moins d'une
      heure de consultant") + ligne "1 AO gratuit à l'inscription, sans CB" au-dessus des
      cartes (clés `freeTrial`/`freeTrialCta` existaient déjà mais n'étaient jamais
      rendues nulle part -- même symptôme que `FeaturesSection`, du contenu écrit mais non
      câblé). **I5 corrigé au passage** : `starterFeats` affichait "50 AOs/mois" ET
      "Génération illimitée" en même temps (contradiction textuelle exacte du constat I5),
      alors qu'Essentiel a un vrai plafond dur (`plans.py::max_ao_per_month=50`) --
      `f_unlimited_gen` retiré de `starterFeats`, dédupliqué de `proFeats` (redondant avec
      `f_ao_illimite`).
    - 6.7 FAQ : nouvelle section `FaqSection.tsx`, 8 objections rédigées (pas de document
      "stratégie chapitre 15" trouvé dans le dépôt, confirmé absent avec l'utilisateur qui
      a demandé de rédiger directement), confidentialité et prix en premier comme demandé.
    - 6.8 Footer : liens légaux ajoutés (déjà fait, voir plus haut), icônes LinkedIn/X
      supprimées (`href="#"` mortes), liens nav du footer et de la nav principale
      convertis de `<button onClick>` vers `<a href>` réels (I1, crawlabilité).
    - I7 : nav "Inscription"/"Accéder" concurrents corrigés -- poids visuel inversé,
      "Liste d'attente" (ex-Inscription) devient le bouton plein primaire, "Se connecter"
      (ex-Accéder) devient un lien texte secondaire.
    - I4 vérifié déjà propre (pas fait dans cette session, confirmé en relisant le code) :
      `f_providers` ne nomme aucun provider LLM sur la page tarifs.
    - Non fait, hors scope choisi : 6.2 (vidéo de démo, aucun asset vidéo disponible,
      pas de bouton "Voir la démo" ajouté pour ne pas promettre une preuve qui n'existe
      pas), mobile réel non testé (point 1 du rapport, nécessite un téléphone physique).
    - **Vérification finale** : `tsc --noEmit` propre, `vite build` propre (chunks >500kB
      pré-existants, pas aggravés). `pytest` : 6 failed + 7 errors, tous confirmés
      pré-existants et sans rapport avec les fichiers touchés cette session (billing,
      user, migration 011, tout le frontend) -- les 7 `ERROR` viennent d'un
      `ConnectionRefusedError` au démarrage du lifespan FastAPI faute de MinIO
      (`aurs_minio_dev`, un autre projet local, occupe déjà le port 9000), les 6 `FAILED`
      touchent `test_worker_db`/`test_worker_config`/génération/rate-limiting, aucun
      recoupement avec le code modifié. Migration 011 appliquée et vérifiée en réel
      (`POST /auth/register` avec entreprise/secteur_activite/nb_ao_par_an, ligne
      confirmée en base puis nettoyée).

- **AO Watcher : fix réel du téléchargement DCE bloqué** (2026-08-17) : root cause identifiée
  en conditions réelles (curl + Playwright contre le vrai portail marchespublics.gov.ma,
  refConsultation=1029951) -- `zip_url` (100% des 1188 AO qui en ont un, 0 lien direct) pointe
  systématiquement vers le formulaire `EntrepriseDemandeTelechargementDce` du portail, jamais
  vers un fichier. L'ancien code (`_fetch_document` dans `download_tasks.py`) POSTait ce
  formulaire avec des champs vides via `httpx` -- le portail refusait silencieusement (retour
  sur la page de la consultation) et l'ancien code uploadait quand même ce HTML sur MinIO en le
  marquant "téléchargé avec succès" (`zip_downloaded_at` renseigné, contenu invalide). Fix :
  nouvelle méthode `MPEPlatformScraper.download_document()` (`ao-watcher/app/modules/
  ao_scraper/mpe.py`) qui pilote un vrai navigateur Playwright -- remplit Nom="Adjuja",
  Prénom="Adjuja", Email="contact@adjuja.com" (raisonSocial/ICE confirmés non obligatoires par
  les marqueurs `champ-oblig` du formulaire lui-même), coche les CGU, valide, puis clique le
  bouton "Télécharger le Dossier de consultation" qui n'apparaît qu'après validation.
  `download_tasks.py` réécrit pour appeler cette méthode (ancien code httpx supprimé) et pour
  filtrer les fichiers verrous/temp Word (`~$*.doc`, `~WRL*.tmp`) présents dans les vrais zips
  du portail, qui auraient sinon été uploadés comme faux `autre_doc_N.pdf`. Vérifié en réel de
  bout en bout (zip 6,9 Mo avec CPS/RC/AE authentiques récupéré via la classe de prod elle-même,
  pas juste un script jetable).
- **AO Watcher : "aucun lien" pas toujours définitif + collision de labels multi-lots**
  (2026-08-17, suite directe du fix ci-dessus, découvert en testant en conditions réelles) :
  le scraper n'enrichit une consultation (`fetch_detail`, donc `zip_url`) qu'une seule fois, à
  sa découverte -- si l'acheteur met en ligne le DCE après notre passage, `zip_url` reste NULL
  indéfiniment même si le lien existe bel et bien sur le portail (confirmé sur un cas réel : AO
  6388/refConsultation=1029951, scrapé le 16/08 sans lien, lien présent le 17/08). Fix : nouvelle
  tâche Celery `refresh_and_download_ao_zip` (`download_tasks.py`) + `AoRepository.update_zip_url`
  -- quand l'utilisateur favorise une AO sans `zip_url` connu, `router.py` revérifie en direct la
  page de détail avant d'afficher "aucun lien" ; si trouvé, chaîne vers `download_ao_zip`. Le
  polling frontend (`AoDetailPanel.tsx`) couvre maintenant aussi l'état `noZipLink`, borné à 15
  tentatives (~45s) pour ne pas boucler indéfiniment sur une AO qui n'a vraiment aucun document.
  Séparément, testé sur ce même AO 6388 (3 lots, donc 3 fichiers CPS distincts dans le zip) :
  `_classify()` collapsait les 3 CPS sur la même clé MinIO `cps.pdf`, les 2 premiers étant
  silencieusement écrasés par le 3e (perte de données réelle, constatée en DB avant fix -- un
  seul `"cps"` dans `classified_docs` malgré 3 fichiers uploadés). Fix : suffixe `_2`, `_3`... sur
  collision de label, même pattern que `autre_doc_N`. Les deux fixes vérifiés en réel sur ce même
  AO (`cps`, `cps_2`, `cps_3` tous distincts en DB après re-téléchargement). Les ~31,5% d'AO sans
  aucun lien `linkDownloadDce` du tout sur leur page de détail (548/1736, cas différent de celui
  ci-dessus) restent un problème distinct, géré côté frontend par le message `noZipLink`.
- **Job de nettoyage des AO/BDC expirées** (2026-08-17) : nouvelle tâche Celery quotidienne
  `cleanup_expired_watcher_items` (`ao-watcher/app/workers/tasks/cleanup_tasks.py`, beat à 02h00
  Africa/Casablanca) + `AoRepository.delete_expired_unactioned` / `BdcRepository.
  delete_expired_unactioned`. Décision validée avec Ahmed : supprime uniquement les AO/BDC au
  statut `new`/`seen` (jamais favorisées/importées) dont `date_limite < aujourd'hui`,
  suppression définitive immédiate (pas de délai de grâce, pas d'archivage). Les AO/BDC
  `favorited`/`imported` sont préservées même expirées (documents déjà téléchargés). Vérifié
  en conditions réelles sur la base actuelle : 1037 AO + 3897 BDC supprimées, 0 restante après
  coup, `favorited`/`imported` intacts. **Bug d'environnement découvert et corrigé au passage**
  (sans lien avec le code applicatif) : après le redémarrage de Docker Desktop, `docker start`
  sur `adjuja-postgres-1`/`adjuja-redis-1` les a laissés avec un réseau Docker vide (`{}`) --
  `docker network connect` fait à la main (sans passer par `docker compose`) ne pose PAS l'alias
  DNS du nom de service (`postgres`/`redis`) que `DATABASE_URL`/`REDIS_URL` utilisent, seulement
  le nom du conteneur -- résolution DNS cassée en silence pour tous les autres conteneurs tant
  que `--alias postgres`/`--alias redis` n'est pas explicitement passé. À refaire ainsi si ça se
  reproduit : `docker network connect --alias <nom_service> adjuja_ao_network <conteneur>`.
- **Refonte pages auth + nav landing** (session du 2026-08-17, non documenté avant faute de
  mise à jour intermédiaire) : `AuthLayout.tsx` (nouveau, split-screen login/register avec
  showcase produit), Google Sign-In reconfiguré avec le nouveau `GOOGLE_CLIENT_ID` (bouton
  natif Google rendu invisible, déclenché par un bouton custom pour respecter le design
  system -- jamais de pill/rounded-full), fix du menu mobile transparent (bug de containing
  block CSS `backdrop-filter`, résolu via `createPortal` vers `document.body`), polling ajouté
  sur `AoDetailPanel`/`BdcDetailPanel` pour ne plus rester bloqué sur "téléchargement en cours"
  indéfiniment. Rebrand email site-wide `support@`/`noreply@` -> `contact@adjuja.com`, lien
  agence corrigé vers `https://www.continuium.com/` (Continuium, pas Continuum).
- **Redéploiement prod + 4 bugs d'infra réels trouvés et corrigés** (2026-08-17/18, détail
  complet dans la mémoire auto [[project-prod-deployment-issues]]) : (1) DNS apex
  `adjuja.com` avait 4 IP parasites Google en plus de la bonne -- site inaccessible de façon
  consistante (5/5, pas intermittent), corrigé en supprimant les 4 A records parasites côté
  registrar (Genious) ; (2) `frontend/nginx.conf` ne mettait aucun `Cache-Control` sur
  `index.html` -- Google Sign-In marchait en incognito mais jamais en navigation normale
  (vieux bundle JS caché indéfiniment), fix : `no-cache` sur `index.html`, cache long
  immutable sur `/assets/` ; (3) `Dockerfile` (stages `final` et `api-dev`) ne copiait
  jamais `alembic/`/`alembic.ini` dans l'image -- `alembic upgrade head` impossible en prod,
  fix : `COPY` ajouté aux deux stages ; (4) découverte associée : le schema DB prod n'avait
  **jamais** été suivi par Alembic (`alembic_version` inexistante, schema créé via
  `create_all()` à un moment) -- `alembic stamp 010` puis `upgrade head` a appliqué
  uniquement le vrai gap (migration 011, colonnes `entreprise`/`secteur_activite`/
  `nb_ao_par_an`), stamp vérifié sûr après comparaison exacte des tables prod contre le
  schema dev totalement migré. **Rappel process pour toute future migration prod** :
  toujours vérifier `SELECT * FROM alembic_version` en prod AVANT de lancer `upgrade head`
  en aveugle. Login (normal + Google) confirmé fonctionnel en prod après ces 4 fixes.
- **Refonte Google Sign-In : authorization code flow au lieu du hack bouton caché**
  (2026-08-19). Root cause du bug "bouton ne répond plus après un premier clic sur
  mobile" : l'ancien flux rendait le vrai bouton Google invisible (`renderButton` dans un
  iframe) et forwardait des clics synthétiques dessus (`querySelector('div[role="button"]')
  .click()`) -- fragile par construction, l'état interne de l'iframe Google peut changer
  après une interaction et rien ne garantit qu'un clic synthétique retrouve un élément
  cliquable la fois suivante. Remplacé par un vrai flow OAuth : bouton custom ->
  `window.location.href` vers l'URL d'autorisation Google réelle (avec `state` CSRF en
  sessionStorage) -> callback `GoogleCallbackPage.tsx` (nouvelle page,
  `/auth/google/callback`) -> `POST /api/v1/auth/google/callback` (nouvelle route, backend
  échange le code via `GOOGLE_CLIENT_SECRET` déjà en `.env` mais jamais utilisé jusqu'ici) ->
  même logique verify/find-or-create/JWT qu'avant. Ancienne route `POST /auth/google`
  (ID-token direct) supprimée, plus de script GSI dans `index.html`, plus de hack dans
  `LoginPage.tsx`/`RegisterPage.tsx`. **Bug corrigé au passage, signalé par l'utilisateur** :
  le client ID Google était hardcodé en dur dans le code (`api.ts`) -- maintenant
  `import.meta.env.VITE_GOOGLE_CLIENT_ID`, injecté via `frontend/.env`
  (gitignored, dev local) + `frontend/.env.example` (tracké) + build arg Docker
  (`docker-compose.yml`/`Dockerfile`, source `GOOGLE_CLIENT_ID` du `.env` racine).
  **Non fait, nécessite action utilisateur** : Google Cloud Console a besoin des nouvelles
  Authorized redirect URIs (`https://adjuja.com/auth/google/callback`,
  `https://www.adjuja.com/auth/google/callback`, `http://localhost:5173/auth/google/callback`)
  -- liste séparée des Authorized JavaScript origins déjà configurées, sinon 400 côté Google.
  `tsc --noEmit` + `py_compile` propres, non commité, nécessite rebuild Docker `api` +
  `frontend` (aucun volume mount pour `app/` dans ni dev ni prod, confirmé).
- **Refonte inscription : compte créé seulement après OTP, plus avant** (2026-08-19).
  L'utilisateur a signalé que l'inscription créait un compte réel immédiatement, sans
  jamais envoyer d'email de vérification -- root cause double : (1) `RESEND_API_KEY`
  jamais câblé dans le service `api` du compose dev (seul notification-service l'avait),
  `send_verification_email` faisait un no-op silencieux vers un log serveur invisible ; (2)
  même une fois l'email fonctionnel, l'ancien flux créait la ligne `users` AVANT toute
  vérification (lien cliquable, pas OTP) -- la vérification était cosmétique, jamais
  bloquante. Refait : `POST /auth/register` ne crée plus de compte, génère un OTP à 6
  chiffres, stocke l'inscription en attente dans Redis (`app/cache/cache.py`, réutilisé tel
  quel, TTL 15 min, mot de passe déjà hashé jamais stocké en clair, 5 tentatives max) et
  envoie le code par email. Nouvelle route `POST /auth/verify-otp` vérifie le code et SEUL
  ce point crée réellement la ligne `users` (`UserService.create()` retravaillé en
  kwargs explicites, `email_verified` découplé de `unlimited` -- avant les deux étaient
  couplés, un utilisateur OTP-confirmé non-admin a maintenant `email_verified=True` sans
  hériter des quotas illimités admin). Ancienne route `GET /verify-email` (lien-based) et
  `UserService.verify_email()` supprimées, dead code après le changement, pas laissées en
  place. **Bug de branding trouvé et corrigé au passage** : `email_service.py` disait
  encore "OffrIA"/`noreply@offria.cloud`, raté lors du rebrand -- passé à
  `ADJUJA <contact@adjuja.com>`. `docker-compose.dev.yml` : `RESEND_API_KEY` ajouté au
  service `api` (gap réel trouvé, corrigé). Frontend : écran statique "vérifiez votre
  email" remplacé par un vrai formulaire de saisie du code à 6 chiffres. `tsc --noEmit` +
  `py_compile` propres, non commité, nécessite rebuild Docker `api`.

## En cours

- **Mode accompagne -- frontend implemente + course `task_match_team` corrigee**
  (2026-09-12). Le chantier est donc complet backend ET frontend ; reste la
  verification en conditions reelles.
  - **Les deux questions ouvertes de `client.md` tranchees** (dans le sens que la
    spec recommandait, non contredit) : une etape `non_applicable` est **affichee
    grisee avec sa raison** (la masquer rendrait le parcours incomprehensible --
    pourquoi 5 etapes et pas 7 ?), et l'edition de la note a l'etape 5 restera un
    **champ texte simple** (le projet n'a aucun editeur riche, en introduire un
    est une dependance a justifier separement).
  - Livre : `features/ao/hooks/useStepPolling.ts`, et les composants
    `StepList`, `StepPanel`, `StepAssistant`, `ModeChoice`, `GuidedPipeline`.
    `AoDetailView` est cable dessus : choix du mode au lancement, parcours guide
    a la place de la barre de progression.
  - **Le piege du polling est traite**, c'est le point que `client.md` signalait :
    le polling express ne s'arrete que sur `termine`/`erreur` et aurait tourne
    **des heures** pendant qu'une etape attend une validation humaine. En mode
    accompagne il est desactive (`isRunning` teste `!isGuided`) et remplace par
    `useStepPolling`, qui s'arrete des qu'aucune etape n'est `en_cours` et ne
    repart qu'apres une validation ou une relance.
  - **Tokens de couleur ajoutes dans `index.css`** (`--l-success/warn/error/info`
    et leurs fonds/bordures, en clair ET en sombre). Il n'en existait aucun pour
    les etats : les composants anterieurs portent ces valeurs en hex inline, ce
    que `ui-context.md` interdit pour du code neuf (« un besoin de couleur = une
    var »). Le nouveau code n'a aucun hex en dur.
  - i18n complet fr + en (mode, 7 etapes, 6 statuts, assistant, statut
    `abandonne`), **verifie par script** : toutes les cles utilisees resolvent
    dans les deux langues. Les accents francais ont ete repris apres une
    premiere passe sans accents, qui violait `code-standards.md`.
  - **Course `task_match_team` corrigee** (`ao_tasks.py`, mode express) :
    `task_generate_note_metho` lit `AoTeamMember`, produit par `task_match_team`
    qui etait lance **detache au meme instant que le chord** -- la note pouvait
    donc partir **sans equipe, en silence**. Le matching precede desormais le
    chord **quand une note metho est au programme** ; il reste detache sinon
    (personne ne lit son resultat en aval). **Consequence assumee** : si le
    matching echoue, le pipeline s'arrete en erreur au lieu de produire une note
    incomplete -- un echec visible vaut mieux qu'un document ampute en silence.
    C'est une modification du chord de production, que la spec identifiait comme
    le risque principal du chantier : a verifier en reel en priorite.
  - Verifie : `tsc --noEmit` propre, `npm run build` vert, modules servis en 200
    par le serveur de dev, 27 tests backend au vert.
  - **Pas encore verifie, et c'est l'essentiel qui reste** : aucun AO reel n'a
    ete traite en mode accompagne. Les criteres de recette de `00-overview.md`
    (arret effectif apres chaque etape verifie en base, mode express sans
    regression, reprise apres fermeture du navigateur, correction reellement
    reprise par l'etape suivante) demandent une stack qui tourne.
  - **Reste a coder** : les corrections utilisateur des etapes 5 (texte de la
    note) et 6 (champs remplis) portent sur des artefacts MinIO ; le corps
    `corrections` de `validate` ne traite aujourd'hui que l'etape 2 et ignore les
    autres avec un log. Les panneaux des etapes 3 a 7 affichent un texte
    d'attente : leur contenu reel depend de `fit-score` (etape 3) et
    `analyse-ao-enrichie` (etape 4).

- **Retour a un depot git unique + tout le travail pousse sur `develop`**
  (2026-09-12). L'utilisateur signalait « des problemes quand je push ».
  Diagnostic mene avant toute action, **trois causes reelles, toutes anterieures
  a cette session** :
  1. **La cle SSH configuree etait la mauvaise.** `core.sshcommand` forcait
     `~/.ssh/id_ed25519_new`, refusee par GitHub. Les 4 cles de la machine ont ete
     testees une a une : seule `id_ed25519_continuium` authentifie le compte
     `Ahmed123359`. Corrigee.
  2. **Cinq depots sur six n'avaient aucun remote**, et **aucun des six depots par
     service n'existait sur GitHub** (verifie par `ls-remote` sur chaque URL). Le
     depot racine improvise les enregistrait en **gitlinks (mode 160000)** vers ces
     depots inexistants : son commit ne contenait donc **aucun fichier source**.
     C'etait la cause principale.
  3. Le `main` local portait le commit de decoupe `6e043a0`, qui **supprime 212
     fichiers** (frontend, watcher, notification, conception, context...). Le
     pousser aurait fait perdre tout cela sur GitHub. Evite en passant par
     `develop`, sur proposition de l'utilisateur.
  - **L'historique n'avait jamais ete perdu** : les 121 commits et le tag
    `pre-split-2026-09-10` etaient intacts, et le distant `main` (`2635b21`) etait
    simplement 2 commits en retard, sans divergence.
  - **Decision de l'utilisateur** : pas de creation de depots sur GitHub, retour a
    un depot unique a la racine avec un dossier par service. La decoupe du
    2026-09-10 est donc annulee ; l'organisation en dossiers reste.
  - **Deux problemes de securite trouves en chemin, un seul corrige** :
    - `Dossier AO HAFID/` (CV, diplomes et pieces signees de personnes nommees)
      etait **inclus dans le commit du depot racine improvise**. Exclu par le
      nouveau `.gitignore`, et absent du commit pousse (verifie).
    - **`JWT_SECRET_KEY` est publiee en clair dans `.env.example`, deja sur
      GitHub depuis `2635b21`, et elle est identique a la cle reellement utilisee
      (`adjuja-infra/.env`).** N'importe qui ayant acces au depot peut forger des
      tokens valides. Remplacee par un placeholder dans le commit, **mais elle
      reste exposee dans l'historique** : la rotation en production reste a faire,
      c'est une decision d'exploitation (elle invalidera les sessions actives).
  - Pousse sur `develop` (`6f54c19`, 424 fichiers, 326 renommages detectes) :
    restructuration monorepo + mode accompagne backend + refonte frontend.
    **`main` n'a pas bouge**, PR a ouvrir sur
    https://github.com/Ahmed123359/Adjuja/pull/new/develop
  - Les six `.git` d'origine sont sauvegardes hors du projet (dossier temporaire
    horodate), rien n'a ete detruit.

- **Refactoring frontend par domaine -- étape 1 (le socle) faite, étapes 2 à 4 à
  faire** (2026-09-12, spec `context/feature-spec/refactoring-frontend/`).
  Demandé par l'utilisateur en interrompant le mode accompagné : « une seule page
  contient des milliers de lignes, pas de composants, pas de réutilisabilité ».
  Diagnostic mesuré : `DashboardPage.tsx` 2485 lignes / **16 composants** / 53
  `useState`, `AoPipelinePage.tsx` 1538, `RightPanel.tsx` 1272, `api.ts` 1381,
  `types.ts` 542.
  - **Trois décisions prises avec l'utilisateur** : déplacement pur d'abord
    (factorisation dans une étape séparée), commencer par le socle `api.ts` +
    `types.ts`, organisation par domaine métier (`features/<domaine>/`).
    Raison de la première : **il n'existe aucun test frontend, aucun lint, aucun
    vitest** -- le seul filet est `tsc && vite build`, donc on ne fait que des
    déplacements que `tsc` vérifie mécaniquement.
  - **Fait** : `api.ts` + `types.ts` découpés en 23 fichiers, le plus gros à 252
    lignes. `features/{ao,veille,company,billing,auth,org,tools,chat,generation,
    marches,notifications}/{api,types}.ts`, plus `shared/lib/http.ts` (jeton,
    `authHeaders()`, helpers de réponse) et `shared/app.{api,types}.ts`.
  - **Ce qui a rendu l'opération sûre** : `api.ts` et `types.ts` sont devenus des
    **barrels de ré-export**, donc les 30+ fichiers qui importent `from "../api"`
    n'ont pas bougé d'une ligne. Le risque est celui d'un déplacement de fichier,
    pas d'une réécriture.
  - **Vérifié, pas supposé** : 110 exports avant / 110 après (aucun perdu, plus 3
    helpers HTTP promus de privés à partagés, nécessaires au découpage), 60 types
    avant / 60 après, comparaison automatique et non à l'oeil. `tsc --noEmit`
    propre, `npm run build` vert, **et serveur de dev réellement lancé** : `/`,
    `main.tsx`, `api.ts`, `features/ao/api.ts`, `shared/lib/http.ts` répondent
    tous 200, aucune erreur de transformation. `tsc` a révélé deux vraies erreurs
    corrigées au passage (dépendance croisée `AppDefaults` -> `CompanyData`, et
    un `import type` égaré au milieu de l'ancien `api.ts`).
  - **Pas encore vérifié** : aucun parcours applicatif réel (connexion, pipeline
    AO de bout en bout) n'a été rejoué dans un navigateur.
  - Conventions mises à jour en même temps pour ne pas les laisser dériver :
    `CLAUDE.md` et `context/code-standards.md` (l'ancienne règle « tous les
    appels passent par `src/api.ts` » ne décrivait plus le code).
  - **Étape 2 faite pour les deux pires fichiers** (2026-09-12, même méthode) :
    - `AoPipelinePage.tsx` (1538) -> `features/ao/` : la page (567) plus
      `components/{StatusBadge,ProgressBar,DocCard,DossierSection,AoDetailView}`.
      Fait **avant** d'écrire le stepper du mode accompagné, précisément pour ne
      pas ajouter des centaines de lignes à un fichier déjà trop gros.
    - `DashboardPage.tsx` (2485, 16 composants) -> `features/company/` :
      6 onglets dans `tabs/`, 6 composants dans `components/`, plus
      `styles.ts`/`constants.ts`. Aucun fichier au-dessus de 458 lignes.
    - **Bénéfice inattendu et réel** : le découpage a rendu visibles des
      dépendances inter-domaines qui étaient invisibles dans le monolithe --
      `OverviewTab` appelle l'API **ao**, `SubscriptionCard` l'API **billing**,
      `OrgMembersSection` l'API **org**, `NotificationPreferencesSection` l'API
      **notifications** et **auth**. Elles étaient noyées dans un unique import
      de 33 fonctions ; elles sont maintenant déclarées là où elles existent.
    - Vérifié : `tsc --noEmit` propre, `npm run build` vert, serveur de dev
      lancé et modules réellement servis en 200. Comparaison automatique
      avant/après : **2286 lignes significatives avant, 2286 après** pour
      `DashboardPage`, les seules différences étant les 15 déclarations passées
      en `export`. Idem pour `AoPipelinePage`.
    - `AoDetailView.tsx` reste à 694 lignes : le découper davantage serait une
      réécriture, pas un déplacement. Assumé, noté pour l'étape 3.
  - **Étape 2 terminée en entier** (2026-09-12) : 50 fichiers de plus déplacés en
    deux passes, par un script qui recalcule tous les imports relatifs du projet
    (108 fichiers traités à chaque passe) plutôt qu'à la main. **`src/components/`
    n'existe plus**, `src/pages/` ne garde que les deux pages sans domaine
    (404, ComingSoon). 14 domaines : ao, veille, company, billing, auth, org,
    tools, chat, generation, marches, notifications, landing, legal, plus
    `shared/{layout,ui,lib}`.
    - Vérifié : `tsc --noEmit` propre **du premier coup** après le déplacement de
      masse, `npm run build` vert, serveur de dev lancé avec les modules servis
      en 200. Comparaison automatique sur tout l'arbre : **19351 lignes
      significatives avant, 19351 après**, les 4 différences étant des chemins
      d'import réécrits (dont un `lazy(() => import(...))`, bien repointé).
    - Les gros fichiers restants sont gros **en eux-mêmes**, plus par
      accumulation : `RightPanel` 1272 (coquille applicative), `OffreTechniqueTab`
      947, `ActeEngagementTab` 792, `AoDetailPanel` 727, `MarchesPage` 719,
      `AoDetailView` 694. Les découper serait une réécriture, pas un déplacement.
  - **Étape 3 (factorisation) non faite, et une découverte change sa nature** :
    les **4 implémentations du polling Celery ne font pas la même chose** --
    `AoDetailView` fait un backoff adaptatif 3/5/8/12s sans borne,
    `tools/DocumentsTab` un `setInterval` fixe multi-jobs, `FillerTab` un
    `setInterval` 4s mono-job, `veille/AoDetailPanel` un `setInterval` 3s **borné
    à 15 tentatives** (le fix du 2026-08-17). Les unifier n'est donc **pas une
    substitution mécanique mais une réécriture de 4 comportements différents**,
    sans aucun test pour la rattraper. Idem pour les 2 `Spinner`, qui ne sont pas
    identiques (bloc centré 20px aux tokens vs 14px blanc inline pour bouton).
    À mener explicitement et séparément, pas en passant.
  - **Étape 4 non décidée** : poser un filet `vitest`, écarté pour l'instant par
    l'utilisateur. La couverture frontend reste à zéro, choix assumé.
  - **Pas encore vérifié** : aucun parcours applicatif réel rejoué dans un
    navigateur. `tsc` + build + modules servis en 200 ne prouvent pas qu'un écran
    s'affiche correctement.

- Notification service en prod, fonctionnel mais sans aucune org configurée -- pas encore
  vérifié en conditions réelles avec un vrai envoi d'email à une org réelle.
- **Restructuration `context/` en spec-driven complet** (2026-08-19), inspirée d'un autre
  projet de l'utilisateur (`Souss-creation/context/`) : `context/` a maintenant, à la
  racine, `project-overview.md`, `architecture-context.md`, `code-standards.md`,
  `ui-context.md` (nouveaux, condensés depuis `CLAUDE.md`/`conception/` et la mémoire auto
  design-system), en plus de `ai-workflow-rules.md`/`progress-tracker.md` déjà existants.
  Chaque feature vit dans son propre `feature-spec/<nom>/` (dossier renommé au singulier
  par l'utilisateur, ancien `feature-specs/01-billing-subscriptions/` supprimé par
  l'utilisateur lui-même pendant cette session -- pas recréé, l'utilisateur a dit de
  construire sur l'état actuel, pas de restaurer ce qui a été supprimé volontairement).
  Règle clé : les fichiers universels (workflow, architecture, conventions, UI) ne sont
  JAMAIS dupliqués à l'intérieur d'un dossier de feature -- une feature ne contient que
  `00-overview.md`/`api.md`/`client.md` qui lui sont spécifiques.
- **Chatbot RAG (marchés publics + aide plateforme) -- code fait, ingestion reportée en
  prod** (2026-09-08, spec dans `context/feature-spec/chatbot/`, build order suivi :
  `api.md` puis `client.md`) : `api.md` et `client.md` sont tous deux implémentés --
  trouvés déjà en place en code au début de cette session (commit `2635b21`, même jour,
  message de commit trompeur "fixing the signature issue" qui ne mentionne pas ce
  travail, jamais tracé ici avant maintenant). Vérifié en relisant le code réel, pas
  supposé fait parce que la spec existe :
  - `RagService.retrieve_for_chat()` (nouvelle méthode, `app/services/rag_service.py`)
    présente, recherche non filtrée par `doc_type` comme spécifié ; `DOCUMENT_TYPES`
    étend bien `reglementation`/`plateforme` avec les accents français corrects (le
    bloc de code dans `api.md` lui-même est en ASCII sans accents, la vraie
    implémentation ne l'est pas -- juste un artefact d'encodage de la spec, pas un
    écart réel).
  - `ChatService._retrieve_rag` appelle bien `retrieve_for_chat`, plus aucune trace de
    l'ancien `retrieve_for_section("Références similaires", ...)`.
  - `frontend/src/App.tsx` : provider par défaut passé à `"mistral"`. `FloatingChat.tsx`
    confirmé inchangé (affichage des sources déjà présent avant cette feature).
  - `ingest_knowledge_base.py` (racine du repo) existe et résout la Question ouverte
    n1 de `api.md` (réutiliser `index_document()` vs. indexation autonome) en faveur de
    l'option 2 : script autonome qui embed + upsert directement contre le client Qdrant
    de `RagService`, sans passer par `index_document()` (qui écrit toujours dans
    `offria_kb_{org_id}`, jamais la collection globale). Amélioration réelle par
    rapport au brouillon de `api.md` : ids de chunks en `uuid5` dérivés de
    `(doc_type, doc_name, index)` plutôt que le `hash() % 2**63` esquissé dans la spec
    -- un re-run met à jour les mêmes points au lieu d'en dupliquer, l'idempotence
    citée dans le docstring du script est réelle, pas juste affirmée.
  - **Non vérifié en conditions réelles sur cette machine, décision explicite de
    l'utilisateur** : le script a été lancé une fois en dev (`docker compose exec api
    python ingest_knowledge_base.py`, dépendances/config confirmées présentes --
    `QDRANT_URL`, `MISTRAL_API_KEY`, `tesseract-ocr-fra`, `poppler-utils` tous OK dans
    le conteneur `api`) puis arrêté volontairement avant la fin de l'OCR du décret
    (88 pages, PDF de 141 Mo à texte vectoriel non extractible, OCR lent) sur demande
    explicite de l'utilisateur : "remove the ingested data from this machine, we will
    ingest in prod". Confirmé directement contre Qdrant dev (`GET /collections/
    offria_kb` -> `points_count: 0`) qu'aucun point n'avait été upserté avant l'arrêt
    -- rien à nettoyer, la collection existe mais est vide. **Reste donc à faire, pas
    fait par cette session** : exécuter `docker compose exec api python
    ingest_knowledge_base.py` contre la stack prod, puis vérifier les 4 critères de
    `00-overview.md` (réponse citant un vrai article de loi, réponse correcte sur le
    fonctionnement d'ADJUJA, pas d'erreur "Clé API manquante" en session fraîche,
    `GET /api/v1/rag/status` avec `chunk_count > 0` et `ready: true`).
  - Décisions verrouillées (rappel, voir `api.md`/`00-overview.md` pour le détail) : pas
    de microservice `rag-etl` (corpus de 3 documents, script ponctuel suffit), tout
    indexé dans la collection globale `offria_kb` (pas per-org), chunking par
    Article/section plutôt que par paragraphe, un seul pipeline RAG pour la
    réglementation ET l'aide plateforme (pas de scission RAG/statique).
  - `hafid-taches-docs/chatbot/guide_plateforme_adjuja.md` porte toujours son
    disclaimer d'origine ("à vérifier et corriger par un humain avant indexation" --
    ton, nuances commerciales, positionnement, pas l'exactitude factuelle qui est
    dérivée du code réel) -- non retiré, non validé par l'utilisateur cette session,
    à faire avant (ou juste après) l'ingestion prod si le ton doit être ajusté.
  - Voir aussi mémoire auto [[project-chatbot-procurement-rag]] pour le détail de
    l'audit RAG original.

- **Initiative "Bidtndr" -- 9 chantiers scopés en feature-spec, aucun code écrit**
  (2026-09-11, étendue le 2026-09-12 ; inspirée par l'utilisateur de la plateforme
  concurrente Bidtndr, captures d'écran réelles de `bidtndr.com` fournies). Discussion
  menée jusqu'au bout avant tout code (`ai-workflow-rules.md` respecté : ne pas
  inventer de comportement non discuté). Neuf dossiers sous `context/feature-spec/`,
  chacun avec un `00-overview.md` ancré dans le code réel (pas supposé) :
  - **`mode-accompagne/` -- ajouté le 2026-09-12, priorité au-dessus des 8 autres.**
    Deuxième régime de traitement d'un AO, étape par étape, avec l'IA en
    accompagnement et une porte de validation entre chaque étape. Né d'une gêne
    exprimée par l'utilisateur : le produit n'a aujourd'hui qu'un seul régime, le
    "minimum de clics" (`ao_routes.py:466-476` lance un `chain` fire-and-forget,
    l'utilisateur clique une fois et récupère un ZIP sans jamais rien pouvoir voir
    ni corriger entre deux étapes) -- rassurant pour un AO à faible enjeu, effrayant
    pour un AO important. **Les deux modes coexistent**, Express reste le défaut et
    n'est pas touché. 7 étapes validées avec l'utilisateur (Documents /
    Compréhension / Décision / Préparation / Rédaction / Remplissage / Signature),
    dont **5 correspondent déjà à une tâche Celery existante** -- le moteur est à
    désassembler et contrôler, pas à réécrire. Ce chantier change le modèle
    d'interaction du produit là où les 8 autres ajoutent des fonctionnalités autour,
    d'où la priorité. Deux conséquences relevées en lisant le code : rédaction et
    remplissage tournent aujourd'hui **en parallèle** dans un `chord`
    (`ao_tasks.py:330-374`) et deviennent séquentiels en mode accompagné (c'est une
    orchestration différente, pas qu'une UI) ; et `ao.statut` existe déjà mais est
    trop grossier (4-5 valeurs pour un parcours à 7 étapes), donc machine à états
    persistée + migration Alembic à ajouter. L'assistant IA par étape recoupe celui
    déjà prévu dans `preview-documents-ocr/` -- à construire une seule fois.
  - `analyse-ao-enrichie/` (renommé depuis `analyse-cps-enrichie/` le 2026-09-12) --
    matrice de risque + sections manquantes de la fiche AO (budget, clauses à
    surveiller, questions MOA, jalons), extension du prompt
    `ao-watcher/app/modules/ao_scraper/analysis.py`, aucun nouveau service.
    Renommé parce que l'ancien nom laissait croire que seul le CPS était analysé :
    **vérifié dans le code, le RC est déjà traité** (`analysis.py:53`
    `_build_analyze_prompt(cps_text, rc_text)`, les deux clés MinIO lues, consigne
    de repli si RC absent). Taxonomie des risques validée le 2026-09-12 (6 types :
    financier, pénalités, éliminatoire, capacité technique, délai, administratif ;
    le LLM retourne probabilité et impact séparément, la sévérité est calculée en
    Python pour rester reproductible).
    **Bug réel trouvé en vérifiant, pas encore corrigé** : `analysis.py:112-113` fait
    `docs.get("cps")` / `docs.get("rc")`, une seule clé chacun -- or un AO multi-lots
    stocke `cps`, `cps_2`, `cps_3`... depuis le fix de collision de labels du
    2026-08-17. **Les lots 2 et suivants ne sont donc jamais analysés**, en silence
    (cas de test réel connu : AO 6388 / refConsultation 1029951, 3 lots). S'y ajoute
    une troncature muette à 60 000 caractères pour le CPS et 40 000 pour le RC
    (lignes 121-122) : sur un gros CPS le modèle analyse un document amputé sans
    qu'aucun signal ne remonte. Les deux à corriger dans ce chantier, c'est le même
    code qu'on ouvre.
  - `fit-score/` -- score pondéré 6 facteurs remplaçant la lecture brute du verdict
    Go/No-Go (`eligibility_service.py` conservé en dessous, pas remplacé), facteurs
    proposés par l'IA (qualifs 30%, conformité admin 15%, références similaires 20%,
    capacité financière 15%, adéquation moyens 10%, géo+bonus 10%) -- **pondérations
    non validées par l'utilisateur**, à confirmer avant `api.md`.
  - `resultats-attribution/` -- scraping d'un 3e mode de listing MPE (résultats
    d'attribution), **vérifié en conditions réelles** :
    `marchespublics.gov.ma/bdc/entreprise/consultation/resultat` public, 317 939
    résultats réels avec adjudicataire/montant/soumissionnaires au 2026-09-11. Le
    portail principal (pas juste BDC) expose l'équivalent via `AvisAttribution`,
    trouvé par recherche mais **pas encore confirmé avec un vrai fetch Playwright**.
    Préalable bloquant pour `concurrents/`.
  - `concurrents/` -- bloqué sur `resultats-attribution/`, critère de définition d'un
    "concurrent" non tranché avec l'utilisateur.
  - `preview-documents-ocr/` -- confirmé par recherche dans le frontend : **aucune
    preview PDF n'existe aujourd'hui**, documents seulement téléchargeables. Bundle
    preview + surlignage/cadrage de passage + citations IA sourcées (nécessite bbox de
    texte, pas juste extraction brute) + assistant IA de préparation d'AO (réutilise
    `ChatService`/`RagService` du chantier chatbot). **Décidé le 2026-09-12** : les
    annotations/surlignages sont **persistés en base**, pas un état d'UI éphémère --
    l'utilisateur veut pouvoir les réutiliser ailleurs qu'à l'endroit de création.
    Ajoute donc une table d'annotations (migration Alembic) au scope ; le PDF source
    dans MinIO n'est jamais modifié. Les surfaces de réutilisation concrètes restent
    à lister au moment d'écrire `api.md`.
  - `dashboard-collaboratif/` -- seul chantier absent du texte initial de
    l'utilisateur, repéré sur les captures (mentions d'équipe, tâches, calendrier de
    jalons), confirmé dans le scope par l'utilisateur le 2026-09-11. Entièrement neuf
    (aucune notion de tâche/mention/jalon en base aujourd'hui), construit au-dessus de
    l'org/membres déjà existants (invitation d'équipe, 2026-08-22/23). **Décidé le
    2026-09-12** : ce chantier introduit un **premier rôle d'organisation**, resté
    hors scope depuis l'invitation d'équipe (l'utilisateur a aussi validé que d'autres
    rôles pourront suivre). Conséquence à ne pas sous-estimer : `POST /org/invite` et
    `DELETE /org/members/{user_id}`, déjà en prod et testés en réel, appliquent
    aujourd'hui la règle "tout membre peut tout, sauf le propriétaire protégé via
    `organizations.owner_id`" -- ils devront consulter le rôle, donc ce chantier
    modifie de l'existant, il n'ajoute pas seulement. Jeu de rôles et matrice de
    permissions à arrêter en écrivant `api.md`. **Décidé aussi le 2026-09-12** : ce
    tableau de bord **remplace** le dashboard actuel, il ne s'y ajoute pas. Portée
    réelle vérifiée dans le code : `DashboardPage.tsx` n'est pas un tableau de bord
    mais une zone de réglages à 6 onglets (`:2475-2480` -- overview, profile,
    signature, documents, equipe, generation), donc le remplacer oblige à reloger les
    5 onglets de réglage dans un espace "Mon entreprise / Paramètres" séparé. **C'est
    une restructuration de la navigation de l'app**, pas une page de plus, et ces
    onglets portent des fonctionnalités en production testées en réel -- le
    déménagement doit rester routage + mise en page, jamais une réécriture.
  - `securite-chiffrement-backup/` -- confirmé par recherche dans `adjuja-infra` :
    **aucun chiffrement ni sauvegarde automatisée n'existe aujourd'hui**. Chantier
    infra pur, indépendant des 7 autres, peut démarrer à tout moment.
  - `download-dce-lenteur/` -- pas une nouvelle fonctionnalité, un bug de perf.
    Cause probable identifiée en lisant `adjuja-watcher/app/modules/ao_scraper/
    mpe.py::download_document` (ligne 398) : cycle complet de navigateur Chromium
    (lancement + fermeture) à chaque tâche Celery de téléchargement, jamais réutilisé
    entre deux favoris, plus un `wait_for_load_state("networkidle", timeout=15000)`
    potentiellement toujours au max. **Pas confirmé par mesure réelle** -- première
    étape du chantier est d'instrumenter avant de corriger, pas de fixer à l'aveugle.
    **Décidé le 2026-09-12** : le chantier est **backend ET frontend**, l'utilisateur
    ayant tranché que la lenteur ressentie vient des deux (temps réel trop long ET
    retour visuel insuffisant). La mesure reste nécessaire, mais pour savoir quoi
    optimiser côté backend, plus pour décider si le chantier est backend. Côté
    frontend, `AoDetailPanel`/`BdcDetailPanel` ont déjà un polling avec un état
    binaire "téléchargement en cours" (2026-08-17) -- ce qui manque est l'étape
    courante, à exposer via le pattern état-Celery-en-Redis + polling déjà utilisé
    par signature/paraphe/remplissage depuis le 2026-07-05.
  - Ordre de dépendance discuté : `mode-accompagne` passe devant (change le modèle
    d'interaction, les autres ajoutent autour) ; `analyse-ao-enrichie`/`fit-score`/
    `download-dce-lenteur` peuvent démarrer immédiatement (s'appuient sur l'existant,
    aucun nouveau scraping) ; `resultats-attribution` doit précéder `concurrents` ;
    `securite-chiffrement-backup` est indépendant et peut être fait à tout moment ;
    `preview-documents-ocr` et `dashboard-collaboratif` sont les plus lourds (nouvelle
    UI + nouveau modèle de données), pas de dépendance dure envers les autres.
    `analyse-ao-enrichie` alimente l'étape 2 de `mode-accompagne` (compréhension de
    l'AO) et `fit-score` son étape 3 (décision), donc les trois se tiennent.
  - **État réel au 2026-09-12** : `mode-accompagne/` a ses trois fichiers
    (`00-overview.md`, `api.md`, `client.md`) et **son backend est implémenté**
    (voir l'entrée dédiée ci-dessous). Les 8 autres chantiers n'ont toujours
    qu'un `00-overview.md`, aucun `api.md`/`client.md`, aucun code.

- **Mode accompagné -- backend implémenté** (2026-09-12, spec
  `context/feature-spec/mode-accompagne/api.md`). Le frontend (`client.md`) n'est
  **pas** commencé. Les trois préalables de la spec ont été levés en lisant le code
  réel avant d'écrire quoi que ce soit, et deux d'entre eux ont changé la donne :
  - **`analyse_json` est bien une copie locale par org, pas une référence
    partagée** (Question ouverte n1 de la spec, tranchée) : `import_from_watcher`
    reçoit le JSON dans le payload HTTP (`ao_routes.py:119`) et l'écrit dans la
    colonne JSONB de sa propre ligne `appels_offres` (`models.py:180`). Une
    correction utilisateur à l'étape 2 ne peut donc pas corrompre les données des
    autres orgs -- la conception de la spec tient telle quelle.
  - **Aucune dépendance cachée entre `task_generate_note_metho` et
    `task_fill_documents`** (Question ouverte n2, tranchée) : la note écrit
    `origine="genere"`, le filler ne lit que `origine="upload"`
    (`ao_tasks.py:722-726`), et leurs suppressions préalables portent sur des
    ensembles disjoints. Les rendre séquentielles est sûr. Seul effet partagé :
    les deux écrivent `pipeline_pct` (50 et 70) sur la même ligne, donc en
    parallèle le pourcentage peut redescendre de 70 à 50. Cosmétique, disparaît
    en séquentiel.
  - **Course réelle trouvée ailleurs, non corrigée, décision à prendre** :
    `task_generate_note_metho` lit `AoTeamMember` (`ao_tasks.py:559-561`), qui est
    le résultat de `task_match_team`, lancé en `.delay()` détaché **au même
    instant que le chord** (`ao_tasks.py:367`). Rien ne garantit que le matching
    soit fini quand la note charge l'équipe : **la note peut partir sans équipe,
    en silence**. C'est un bug latent du **mode express en production**, pas une
    conséquence de ce chantier. Corrigé côté accompagné (le matching est la tâche
    de l'étape 4, donc attendu), **pas côté express** : le corriger obligerait à
    modifier le chord de production, ce que la spec identifie comme le risque
    principal du chantier. À arbitrer avec l'utilisateur.
  - **Statut `abandonne` : aucun filtre frontend ne casse** (Question ouverte n4,
    tranchée). Tous les filtres sont des tests positifs et `StatusBadge` a un
    fallback (`AoPipelinePage.tsx:51`). Il reste à ajouter sa couleur et sa
    traduction quand le frontend sera fait.
  - Ce qui est livré : migration Alembic `013` (colonne `appels_offres.mode`
    défaut `express`, table `ao_pipeline_steps`), modèles SQLAlchemy,
    `app/services/pipeline_steps_service.py` (machine à états, `applicable_steps`
    extraite et **partagée avec `task_build_pipeline`** pour que les deux modes ne
    divergent pas, `advance_or_gate` appelée en fin de chaque tâche),
    `app/services/step_assist_service.py` (assistance IA par étape réutilisant
    `ChatService`), 6 routes (`GET /steps`, `POST /steps/{key}/validate`,
    `POST /steps/{key}/rerun`, `GET|POST /steps/{key}/assist`, `POST /abandon`)
    plus `POST /start-pipeline` étendu d'un corps `{mode}`, et un handler de
    signal `task_failure` dans `celery_app.py`.
  - **Manque comblé au passage** : il n'existait **aucune gestion d'échec globale**
    des tâches du pipeline -- une tâche qui levait laissait l'AO en
    `en_traitement` indéfiniment, dans les deux modes. Le handler de signal
    Celery pose maintenant l'étape en `erreur` et l'AO en `erreur`. Branché en
    signal, donc aucune tâche métier n'a été modifiée pour ça.
  - **Vérifié en conditions réelles, pas supposé** : 27 tests unitaires verts
    (dont 13 nouveaux sur `applicable_steps` et les définitions d'étapes), chaîne
    de migration complète `001` -> `013` appliquée contre un vrai Postgres dans
    une base jetable (`offria_mig_test`, supprimée après), schéma produit inspecté
    au `\d` et non déduit du message de succès, aller-retour `downgrade 012` puis
    `upgrade head` rejoué. La base dev n'a pas été touchée (elle n'est **pas**
    gérée par Alembic : pas de table `alembic_version`, tables créées par
    `init_db.py` -- à savoir avant tout déploiement).
  - **Reste à faire sur le backend** : les corrections utilisateur des étapes 5
    (texte de la note) et 6 (champs remplis) portent sur des artefacts MinIO, pas
    sur la ligne AO. Le corps `corrections` de `validate` ne traite aujourd'hui
    que l'étape 2 (fusion dans `analyse_json`), et **ignore explicitement** les
    autres avec un log. Les routes documents dédiées restent à écrire.
  - Les tests d'intégration `tests/integration/test_api.py` échouent sur des
    `ConnectionError` (Redis/services absents de cette machine), état antérieur et
    sans rapport avec ce chantier.

## Questions ouvertes

- **Trois tests orphelins cassent la CI backend depuis le 2026-07-02, trouvé le
  2026-09-10.** `tests/unit/test_worker_config.py`, `test_worker_db.py` et
  `test_worker_scraper.py` font `import worker`, mais le commit `59e563b`
  ("chore: nettoyage repo", 2026-07-02) a sorti `worker/` du suivi git et l'a mis dans
  `.gitignore` **sans supprimer ses tests**. Résultat : `pytest tests/` échoue à la
  collecte sur toute machine ou CI qui n'a pas le dossier `worker/` en local -- donc la
  CI GitHub Actions est rouge depuis cette date. Ce n'est pas causé par la découpe en
  dépôts, seulement révélé par elle (avant, le `worker/` local de la machine de dev
  masquait le problème puisque pytest tournait depuis la racine).
  `worker/` est du code mort, remplacé par `adjuja-watcher`. Décision à prendre :
  supprimer les trois fichiers de test, ou déplacer `worker/` + ses tests dans un dépôt
  à part si le code doit revivre. **Non fait sans arbitrage** : supprimer des tests est
  un choix qui appartient à l'utilisateur.

- **`POSTGRES_PASSWORD` et `ADMIN_SECRET` ne sont ni dans `.env` ni dans `.env.example`**
  (constaté le 2026-09-10). `docker-compose.yml` (prod) les interpole sans valeur par
  défaut, donc `docker compose config` avertit et un `up` en prod créerait Postgres avec
  un mot de passe vide. Le compose dev ne le voit pas, il a des défauts
  (`${POSTGRES_PASSWORD:-offria_dev}`). Antérieur à la découpe en dépôts (le fichier
  `.env` a été déplacé tel quel, octet pour octet). À confirmer : le serveur de prod a
  probablement son propre `.env` complet, auquel cas il ne reste qu'à compléter
  `.env.example` pour que ce soit documenté.

- **Build Docker non vérifié après la découpe** (2026-09-10). `docker compose config`
  passe sur les deux fichiers, mais ce n'est que du parsing côté client : ça ne prouve
  pas qu'une image se construit. Docker Desktop n'était pas démarré pendant la session
  (`failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`).
  À faire au prochain démarrage de Docker, en particulier pour valider la suppression de
  l'étape `frontend-builder` du Dockerfile backend :
  `cd adjuja-infra && docker compose -f docker-compose.dev.yml build api` puis un `up`
  avec vérification des logs réels des containers.


- **402 en toast sur create_ao/upload_document** : `SubscriptionCard` (fait) gère son propre
  bouton checkout, mais les appels existants `POST /ao`, `POST /ao/from-watcher`,
  `POST /company-documents` ne traduisent pas encore un `402` (plafond de plan atteint) en
  message clair côté UI -- ils tombent dans la gestion d'erreur générique existante. À faire
  quand quelqu'un heurte réellement le plafond (pas de composant toast partagé identifié
  dans `DashboardPage.tsx` pour l'instant, juste des `<p style={{color:'#dc2626'}}>` locaux).
- **Champs CMI exacts** : `app/billing/provider/cmi.py` est un squelette basé sur le pattern
  générique des passerelles bancaires MENA (page hébergée + HMAC), pas une intégration
  confirmée. À corriger contre le vrai guide d'intégration marchand une fois le compte CMI
  obtenu -- tout est piloté par `.env` (`CMI_*`), aucun code à toucher pour les credentials.
- **Seat limit (utilisateurs/org)** : `SubscriptionService.check_seat_limit` existe mais
  n'est câblé nulle part -- aucun endpoint d'invitation d'équipe n'existe encore dans le
  code, donc rien à câbler pour l'instant.
- **`ParapheTab.tsx`** utilise encore l'ancien `signPdf` (retiré de `api.ts`) -- doit être
  réécrit pour utiliser `startSign`/`getSignStatus`/`cancelSign` comme `DocumentsTab.tsx`.
- **`RemplissageTab.tsx`** utilise encore l'ancien `runFiller` (wrapper de compatibilité) --
  même traitement asynchrone que `FillerTab.tsx` à appliquer.
- **`notify_bdc`** : flag existant en DB (`notification_preferences.notify_bdc`) mais jamais
  implémenté côté logique d'envoi. Toujours pas exposé dans l'UI préférences (2026-08-20,
  décision verrouillée dans `context/feature-spec/notification-preferences/api.md` :
  cadence BDC séparée, hors scope de cette feature).
- **ALTER TABLE `notification_preferences` en prod** : appliqué en dev (2026-08-20, colonnes
  créées directement via `init_db.py` sur une DB vierge, pas testé comme un vrai `ALTER` sur
  une table existante avec des lignes) -- à exécuter manuellement en prod avant déploiement
  du nouveau code (SQL documenté dans l'en-tête d'`init_db.py`), sinon `PUT /preferences`
  échouera sur les colonnes manquantes dès le premier appel.
- **Rendu visuel réel de la section notifications (`ProfileTab`)** : jamais ouvert dans un
  navigateur (2026-08-20, pas d'outil de capture d'écran disponible cette session) --
  vérifié seulement par `tsc`/`vite build`, à confirmer visuellement avant mise en prod.
- **Cause exacte du bug `init_db.py`** (schema créé, tables non créées) non investiguée en
  profondeur -- contournement SQL manuel appliqué, mais si un futur service ajoute des
  tables via le même pattern (`Base.metadata.create_all(engine, checkfirst=True)`), vérifier
  en DB directement plutôt que de faire confiance au message de succès.
- **Mentions légales incomplètes** : `/mentions-legales` n'a ni RC, ni ICE, ni capital
  social, ni identité de l'hébergeur -- à ajouter dès que la société est immatriculée et
  que le fournisseur d'hébergement de prod est confirmé.
- **Bucket MinIO `offria` côté ao-watcher** : pas de `_ensure_bucket()`/`bucket_exists()`
  avant `put_object` dans `download_tasks.py`/`download_bdc_tasks.py`, contrairement au
  client MinIO de l'app principale qui a ce garde-fou. Si le bucket est un jour supprimé ou
  recréé sans lui, le téléchargement de DAO échoue silencieusement avec `NoSuchBucket`.
  Pas corrigé au niveau code, seulement recréé manuellement en prod le 2026-07-05.
- **Fichiers de dossier AO renommés `.pdf` même quand ce ne sont pas des PDF** : constaté sur
  un vrai zip récupéré (2026-08-17) -- la majorité des documents (CPS, RC, AE) sont en réalité
  des `.doc` Word, mais `download_tasks.py` (`_download_and_classify`, branche zip) uploade
  systématiquement chaque membre en `{label}.pdf` / `content_type=application/pdf` sans
  regarder l'extension réelle. Si un pipeline en aval (parsing CPS, OCR, go/no-go) suppose du
  PDF, ces fichiers `.doc` renommés `.pdf` casseront l'ouverture. Pas corrigé (hors scope du
  fix de téléchargement de cette session) -- à vérifier si un pipeline en aval ouvre ces
  fichiers comme du vrai PDF avant de le corriger.

## Roadmap (voir `conception/1.Roadmap/roadmap_technique.md` pour le détail complet)

Items `[PROD]` non cochés à surveiller en priorité : HTTPS en production (reverse proxy
devant le port 8000). Le reste (`[SCALE]`, `[UX]`, `[QUALITE]`) est du travail futur non
bloquant, voir le fichier roadmap directement, ce tracker ne le duplique pas.

## Notes de session

- Toute la trace détaillée par sujet (ao-watcher, notification-service, sécurité, design
  system, etc.) vit dans la mémoire auto-persistante (`C:\Users\PC\.claude\projects\...\memory\`),
  indexée par `MEMORY.md`. Ce tracker est un résumé consolidé pour reprendre le fil
  rapidement en début de session, pas un remplacement de la mémoire détaillée.
