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
- **Bucket MinIO `offria` côté ao-watcher** : pas de `_ensure_bucket()`/`bucket_exists()`
  avant `put_object` dans `download_tasks.py`/`download_bdc_tasks.py`, contrairement au
  client MinIO de l'app principale qui a ce garde-fou. Si le bucket est un jour supprimé ou
  recréé sans lui, le téléchargement de DAO échoue silencieusement avec `NoSuchBucket`.
  Pas corrigé au niveau code, seulement recréé manuellement en prod le 2026-07-05.

## Roadmap (voir `conception/1.Roadmap/roadmap_technique.md` pour le détail complet)

Items `[PROD]` non cochés à surveiller en priorité : HTTPS en production (reverse proxy
devant le port 8000). Le reste (`[SCALE]`, `[UX]`, `[QUALITE]`) est du travail futur non
bloquant, voir le fichier roadmap directement, ce tracker ne le duplique pas.

## Notes de session

- Toute la trace détaillée par sujet (ao-watcher, notification-service, sécurité, design
  system, etc.) vit dans la mémoire auto-persistante (`C:\Users\PC\.claude\projects\...\memory\`),
  indexée par `MEMORY.md`. Ce tracker est un résumé consolidé pour reprendre le fil
  rapidement en début de session, pas un remplacement de la mémoire détaillée.
