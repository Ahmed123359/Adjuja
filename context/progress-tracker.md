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
pas côté UI ou manuellement en DB. UI frontend pour gérer `PUT /preferences/{org_id}`
toujours pas construite.

## Complété (résumé, voir mémoire auto pour le détail complet par sujet)

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

## En cours

- Notification service en prod, fonctionnel mais sans aucune org configurée -- pas encore
  vérifié en conditions réelles avec un vrai envoi d'email à une org réelle.

## Questions ouvertes

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
- **UI frontend préférences de notification** : jamais construite. `PUT /preferences/{org_id}`
  existe côté API mais aucune org ne peut s'y abonner sans appel curl manuel.
- **`notify_bdc`** : flag existant en DB (`notification_preferences.notify_bdc`) mais jamais
  implémenté côté logique d'envoi.
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
