# Bugs connus

Registre des défauts réels de l'application. Créé le 2026-09-13, après avoir
constaté que plusieurs bugs avaient été trouvés en travaillant sur autre chose,
documentés en passant, puis oubliés.

Règle associée : `ai-workflow-rules.md`, section « Bugs trouvés en chemin ».
Tout défaut découvert est **déclaré ici immédiatement**, puis corrigé.

Ce fichier dit l'état réel. Un bug n'est marqué corrigé qu'après vérification en
conditions réelles, jamais parce que le code « a l'air » bon.

Statuts : `OUVERT` · `CORRIGÉ` (avec la date et comment ça a été vérifié) ·
`REPORTÉ` (avec la raison, qui ne peut être que l'un des deux cas prévus par la
règle) · `À CONFIRMER` (soupçonné, pas encore reproduit).

---

## OUVERT

### Serveur de production saturé en mémoire (OOM), SSH impossible

Serveur Hetzner 4 Go, `adjuja-infra/docker-compose.yml`

Constaté par l'utilisateur le 2026-10-02 (console Hetzner) : le noyau tue des
processus en boucle, `systemd` compris, la connexion SSH échoue. Plus gros
consommateurs : Chromium de Playwright (`headless_shell`, 300 à 430 Mo chacun,
2 en parallèle dans le worker de veille), l'application Java du projet voisin
(`docker`), les workers Celery (4 + 2 + 10 processus). Aucune mémoire
d'échange.

**Corrigé dans le code le 2026-10-02** : worker de veille à 1 processus
(recyclé toutes les 20 tâches) et plafonné à 1200 Mo, API de veille à 900 Mo,
`celery-io` 4 -> 2, `celery-cpu` 2 -> 1, notifications 10 -> 2. **Reste côté
serveur** : redémarrer depuis la console Hetzner, ajouter 4 Go de swap,
déployer. **Arbitrage utilisateur** : 4 Go pour deux applications et deux
bases est juste ; passer à 8 Go ou déplacer le projet voisin.

### Email de veille : estimation et caution « Non publiée » sur les AO allotis, « 0 DH »

`adjuja-watcher/app/modules/ao_scraper/mpe.py`, `adjuja-notification/app/templates/ao_digest.py`

Signalé par l'utilisateur le 2026-10-02 (email de production). Deux causes,
vérifiées sur le portail :
- **AO alloti** : la page de synthèse indique « N Lots » et laisse estimation
  et caution vides ; elles sont publiées **par lot** sur une page à part
  (`commun.PopUpDetailLots`), que la lecture de la page détail ne suivait pas.
- **Caution nulle** : le portail publie 0 quand aucune caution n'est exigée,
  l'email affichait « 0 DH ».

**Corrigé dans le code le 2026-10-02** : pour un AO alloti, la page des lots
est lue et les estimations et cautions sont additionnées (vérifié en réel sur
l'AO 1041008 : 104 324 532,10 DH, caution 1 664 000 DH ; test
`test_sommes_lots`) ; une caution nulle s'affiche « Non exigée ». Reste : après
déploiement, lancer le rattrapage des détails (panneau d'administration) pour
compléter les AO allotis déjà en base.

### Partage du lien : l'aperçu affiche encore « OffrIA / Offria.cloud »

`adjuja-frontend/public/og-image.png`, `index.html`

Signalé par l'utilisateur le 2026-10-01 (capture WhatsApp). Le titre et la
description de l'aperçu étaient déjà « ADJUJA », mais l'image de partage
(`og:image`) était restée l'ancienne bannière OffrIA, de surcroît hors format
(704 x 248 au lieu de 1200 x 630). Le logo des données structurées (JSON-LD)
pointait sur la même image.

**Corrigé dans le code le 2026-10-01** : nouvelle image `og-adjuja.png`
(1200 x 630, sigle, mot-symbole Manrope, accroche, fond de marque), sous un
**nouveau nom** pour contourner le cache de WhatsApp et Facebook ; l'ancien
fichier est remplacé par la même image ; dimensions et texte alternatif
déclarés ; JSON-LD sur `logo-adjuja-mark.png`. À confirmer après déploiement
(un aperçu déjà vu par WhatsApp peut rester en cache quelque temps ; le
débogueur de partage de Facebook force la relecture).

### Site public sur téléphone : logos des acheteurs coupés sous le héros

`adjuja-frontend/src/features/landing/components/HeroSection.tsx`

Signalé par l'utilisateur le 2026-10-01 (capture téléphone). Le héros avait une
hauteur fixe d'un écran avec `overflow-hidden` ; sur téléphone, le titre, la
phrase et les deux boutons empilés poussaient la bande des acheteurs sous le
bord du héros, qui la coupait à mi-hauteur. **Corrigé dans le code le
2026-10-01** : hauteur minimale d'un écran (`min-h`) au lieu d'une hauteur
fixe, marge sous les boutons réduite sur téléphone ; rien ne change sur
ordinateur. Vérifié par construction (règle CSS générée). À confirmer sur
téléphone après déploiement.

### Première invitation : le propriétaire perd la vue sur tous ses dossiers

`adjuja-backend/app/services/user_service.py`, `ensure_own_org`

Trouvé le 2026-09-30 en lisant l'activation d'offre pour le panneau
d'administration. Reproduit par `tests/integration/test_organisation_solo.py`
(échoue sans la correction, passe avec). Un utilisateur seul n'a pas
d'organisation : ses données sont rangées sous son propre id (`org_id or id`,
60 endroits : dossiers, profil, CV, documents, tâches, messages...). À sa
première invitation, `ensure_own_org` créait une organisation avec un
**nouvel** identifiant et le lui assignait : dès lors, toutes les lectures
filtraient sur ce nouvel id et ses dossiers antérieurs, restés sous l'ancien,
disparaissaient de son écran (sans être effacés).

**Corrigé dans le code le 2026-09-30** : l'organisation créée prend l'id de
l'utilisateur, celui sous lequel ses données sont déjà rangées. À vérifier en
production : un propriétaire qui a déjà invité quelqu'un a peut-être des
données orphelines. Requête de contrôle :
`SELECT u.email FROM users u JOIN organizations o ON o.owner_id = u.id AND o.id <> u.id
WHERE EXISTS (SELECT 1 FROM appels_offres a WHERE a.org_id = u.id);` -- si elle
renvoie des lignes, un rattrapage des `org_id` est à écrire.

### Activer une offre pour un utilisateur seul échoue (clé étrangère)

`adjuja-backend/app/services/subscription_service.py`, `activate`

Trouvé le même jour, même lecture, reproduit par le même test d'intégration.
`subscriptions.org_id` référence
`organizations.id`, mais l'org d'un utilisateur seul est son id d'utilisateur,
sans ligne dans `organizations` : l'insertion violait la clé étrangère. Un
client seul payant par CMI (webhook) ou activé à la main n'aurait jamais eu
son offre, et la levée du plafond de génération (`User.org_id == org_id`)
ne le touchait pas non plus.

**Corrigé dans le code le 2026-09-30** : `activate` crée d'abord, si besoin,
l'organisation de l'utilisateur seul (même id), comme `ensure_own_org`.

### Veille : 500 AO sans lien DCE depuis l'effacement du 2026-09-13, jamais restaurés

`adjuja-watcher/app/modules/maintenance.py` (rattrapage)

Relevé le 2026-09-30 par le panneau d'administration, sur la base de dev :
lien du DCE présent sur 54,5 % des AO ouverts de marchespublics contre 100 %
des récents. Recoupé en SQL : 500 des 517 AO découverts le 2026-09-12 n'ont
pas de `zip_url`, tous les AO découverts ensuite en ont un. Cause : le bug du
2026-09-13 (re-scrape qui effaçait `zip_url`, corrigé ce jour-là dans
`upsert_many`) a laissé ces AO vides, et aucun rattrapage n'a jamais visé ce
champ. Conséquence atténuée : le téléchargement au favori relit l'URL
(`refresh_and_download_ao_zip`).

**Corrigé dans le code le 2026-09-30, vérifié en dev** : le rattrapage des
détails vise aussi les AO ouverts sans `zip_url` et le restaure s'il est
publié. Rattrapage réel limité à 3 AO du 2026-09-12 lancé depuis le panneau :
lien DCE, référence et estimation restaurés sur les trois. Reste : le lancer en
production (compter d'abord par simulation), puis classer ce bug CORRIGÉ.

### Veille : la reprise d'un scrape en échec était toujours ignorée

`adjuja-watcher/app/workers/tasks/scrape_tasks.py`, `scrape_bdc_tasks.py`

Trouvé le 2026-09-30 en branchant la trace des passages (lecture du code, pas
reproduit en réel). Les deux tâches de scrape posent un cooldown d'1 h dans
Redis puis, en cas d'échec, se relancent 5 min plus tard (`self.retry`,
`default_retry_delay=300`). La reprise retombait sur le cooldown encore actif
et s'arrêtait aussitôt (`skipped: cooldown`) : un scrape en échec attendait
toujours le passage planifié suivant, 6 h plus tard, malgré le mécanisme de
reprise.

**Corrigé dans le code le 2026-09-30, non vérifié en réel** : une reprise
(`self.request.retries > 0`) ne repasse plus par le cooldown. À confirmer au
premier échec réel, visible désormais dans `watcher.scrape_runs` (une ligne
`erreur` suivie d'une ligne `ok` ou `erreur`, jamais `ignore`).

### Inscription d'une adresse de `ADMIN_EMAILS` sans vérification (faille)

`adjuja-backend/app/api/routes/auth_routes.py`, `register`

Trouvé le 2026-09-30 en écrivant `feature-spec/admin-panel/api.md` (lecture du
code, pas reproduit en réel). Une adresse présente dans `ADMIN_EMAILS` était
inscrite **immédiatement**, sans code OTP, avec `email_verified=True` et des
générations illimitées. Quiconque connaît une adresse admin pas encore inscrite
(ou dont le compte a été supprimé) obtenait ce compte sans en posséder la
boîte. Avec le panneau d'administration, qui s'ouvre sur cette même liste, le
défaut serait devenu une prise de contrôle de la plateforme.

**Corrigé dans le code le 2026-09-30, pas encore déployé** : les admins passent
par l'OTP comme tout le monde (la branche `is_admin` de `register` est
supprimée), `verify_otp` leur pose les générations illimitées
(`services/admin/acces.adresse_admin`), et le panneau exige en plus
`email_verified`. Vérifié par requête réelle sur l'application
(`tests/unit/test_admin_acces.py::test_inscription_admin_passe_par_le_code` :
201 `otp_sent`, aucun compte créé). Reste, avant de le classer CORRIGÉ :
l'essayer en production après déploiement.

### Écrans de connexion : cinq défauts relevés pendant leur refonte

`adjuja-frontend/src/features/auth/`

Trouvés le 2026-09-27 en refaisant les écrans (connexion, inscription, mot de
passe oublié, invitation, retour Google) :

1. **Le libellé de chargement affiché comme erreur.** Quand une erreur n'avait
   pas de message, le repli était `auth.login.submitting` (« Connexion… »),
   `auth.register.submitting` ou `auth.forgot.submitting`.
2. **Trop de tentatives affiché comme panne.** Le limiteur (5/min) répond
   `{"error": ...}` sans `detail` : la connexion affichait « Erreur serveur.
   Réessayez dans un instant. » au lieu de dire de patienter. Les appels passent
   désormais par `readJson`, qui traduit le 429.
3. **Mot de passe oublié : message contraire à la protection anti-énumération.**
   Le serveur répond pareil que le compte existe ou non, mais l'écran affirmait
   « Un code de réinitialisation a été envoyé à … ». Texte remplacé par « Si un
   compte existe pour cette adresse, un code vient d'être envoyé à … ».
4. **Champs blancs en thème clair.** Les écrans ne forçaient pas `.landing-dark` :
   chez un visiteur en thème clair, les champs passaient en blanc sur un fond
   sombre (constaté sur capture).
5. **`getPasswordRules` pouvait rejeter** sur une coupure réseau, sans `catch`
   côté appelant : rejet non géré. Il renvoie maintenant les règles par défaut.

Corrections écrites le même jour, **non vérifiées à l'écran**. À contrôler :
une connexion ratée (message), six connexions ratées en une minute (message du
429), et un mot de passe oublié avec une adresse inconnue.


### Pages légales : les liens de la barre de navigation ne menaient nulle part

`adjuja-frontend/src/features/landing/components/LandingNav.tsx`

Trouvé le 2026-09-27 en refaisant la barre. Elle est partagée avec les pages
légales, mais ses liens (Fonctionnalités, Comment ça marche, Tarifs, FAQ)
cherchaient la section par `getElementById` et appelaient `preventDefault()` :
sur `/cgu` la section n'existe pas, le clic ne faisait donc **rien**.

Correction écrite le même jour, **non vérifiée à l'écran** (pas de navigateur
dans la session) : si la section est absente, la barre navigue vers `/#section`,
et `LandingPage` descend vers l'ancre au montage. Passer en `CORRIGÉ` après un
clic réel depuis une page légale.


### Le formulaire de génération n'est atteignable par aucun chemin

`adjuja-frontend/src/App.tsx` (lignes 147, 171 et 261)

Trouvé le 2026-09-15 en restructurant la navigation pour le tableau de bord.
`LeftPanel`, qui porte le formulaire de génération et son bouton, n'est rendu que
si `appState !== "idle"`. Or seuls deux endroits font sortir de `idle` :
`handleGenerate`, déclenché par ce même bouton, et `handleLoadHistory`, qui
recharge une génération passée. Depuis un démarrage normal, **le formulaire ne
peut donc jamais apparaître** : il faut déjà avoir une génération dans
l'historique pour y accéder.

Non reproduit à l'écran (aucun navigateur dans la session), mais la condition se
lit directement. L'entrée de navigation « offres » a été retirée de la barre
latérale dans ce chantier, faute de contenu atteignable ; le code de l'espace de
génération n'a pas été touché. À trancher : rétablir un point d'entrée réel, ou
retirer cet espace s'il est abandonné.


### Le panneau d'un bon de commande sans document tourne indéfiniment

`adjuja-frontend/src/features/veille/components/BdcDetailPanel.tsx`, ligne 90

Trouvé le 2026-09-14, même lecture. `isDownloading` ne vérifie pas
`document_url` : un BDC favori **sans document publié** affiche « Téléchargement
en cours… » pour toujours, et interroge le serveur toutes les 3 s tant que le
panneau reste ouvert. Le router, lui, ne lance aucun téléchargement dans ce cas
(`bdc.document_url` testé). Défaut certain à la lecture.

**Correction écrite le 2026-09-14** (`hasDocument`, message `bdc.detail.noDoc`),
vérifiée par `tsc` et `npm run build` seulement : aucun BDC sans document dans la
base de dev, et pas de navigateur dans la session. À confirmer à l'écran avant de
passer en CORRIGÉ.

### Le panneau de veille arrête de surveiller un téléchargement DCE au bout de 45 s

`adjuja-frontend/src/features/veille/components/AoDetailPanel.tsx`, `useEffect`
du polling (lignes 214-232)

Trouvé le 2026-09-14 en lisant le code pour le chantier `download-dce-lenteur`.
La limite `attempts > 15` (15 × 3 s) est commentée comme servant au cas « aucun
lien » (`noZipLink`), mais elle s'applique **aussi** à `isDownloading`. Un
téléchargement plus long que 45 s -- gros DCE, ou relance Celery après un échec
(`default_retry_delay=60`) -- laisse le panneau figé sur « Téléchargement en
cours… » alors que les documents sont prêts, jusqu'à ce que l'utilisateur le
ferme et le rouvre. C'est précisément le symptôme que ce polling devait corriger.
Défaut certain à la lecture (l'effet ne redémarre pas : ses dépendances ne
changent pas), pas encore reproduit à l'écran.

**Correction écrite le 2026-09-14** : plus aucune limite pendant un
téléchargement (appels espacés à 10 s après 2 min) ; pour « aucun lien », suivi
limité à la durée de la revérification. Le serveur renvoie bien l'étape en cours
pendant plus de 2 minutes (AO 5, vrai échec puis relance, suivi via l'API), mais
le comportement du composant lui-même n'a été vérifié que par `tsc` et
`npm run build`. À confirmer à l'écran avant de passer en CORRIGÉ.

### Règle de classement `plan` trop large

`adjuja-watcher/app/workers/tasks/download_tasks.py`, `CLASSIFICATION_RULES`

`plan|ccag|cahier.*charge` classe en `ccag` tout fichier dont le nom contient
« plan » : « planning », « plan de formation », « plan de charge »… Un plan n'est
pas un CCAG. Laissé tel quel le 2026-09-13 lors de la correction du RC, parce que
le retirer changerait le classement d'AO déjà traités : à reprendre avec une
vérification sur les AO existants.

---

### Documents permanents : CNAS / CASNOS au lieu de la CNSS marocaine

`adjuja-backend/app/models/company_document.py`, `app/db/models.py:296`,
`app/tasks/ao_tasks.py:1065`, `adjuja-frontend/.../company/tabs/DocumentsTab.tsx`

Trouvé le 2026-09-27 en reprenant l'onglet Documents. Les types de documents
permanents proposés sont `attestation_cnas` et `attestation_casnos` : ce sont
les caisses de sécurité sociale **algériennes**. Au Maroc, la pièce exigée est
l'attestation **CNSS** -- et c'est bien `attestation_cnss` que le pipeline
extrait des RC (`ao_tasks.py:129`, `:251`, `:894`). Une entreprise ne peut donc
pas déposer, parmi ses documents permanents, la pièce que les dossiers lui
réclament.

Non corrigé dans la foulée : les valeurs sont stockées en base
(`company_documents.doc_type`) et listées côté backend. Il faut trancher
(remplacer CNAS/CASNOS par `attestation_cnss`, migrer les lignes existantes,
ou garder les anciennes valeurs en lecture seule) : changement de valeurs
persistées, à discuter avant, conformément à `CLAUDE.md`.

### Tarif annuel affiché mais impossible à souscrire

`adjuja-frontend/.../landing/components/PricingSection.tsx`, `adjuja-backend/app/api/routes/billing_routes.py`

Trouvé le 2026-09-27 en refaisant la page d'accueil. Le bouton « Annuel » affiche
392 / 792 / 2 320 MAD par mois, mais `POST /billing/checkout` ne prend qu'un code
d'offre et facture toujours le mensuel. En attendant un arbitrage (paiement
annuel via CMI, ou retrait du bouton), la page indique « engagement annuel, sur
demande » sous le prix annuel.

### « 1 AO gratuit à l'inscription » : promesse que le plan gratuit ne tient pas

`frontend/src/locales/*.json` (`pricing.freeTrial`), `adjuja-backend/app/billing/plans.py`

Trouvé le 2026-09-27. Le texte promet un AO gratuit ; le plan `free` a
`max_ao_per_month=0`. Une génération gratuite existe peut-être par
`User.max_generations` : à vérifier avant de réutiliser la phrase. Retirée de la
nouvelle page d'accueil en attendant.

## REPORTÉ

### Webhook CMI : `raw_payload` enregistré en `str(dict)` Python, pas en JSON

`adjuja-backend/app/api/routes/billing_routes.py` (webhook `/billing/webhook/cmi`)

Trouvé le 2026-09-27 en préparant la spec `gestion-abonnement`. Le callback est
stocké avec `raw_payload=str(event.raw)` : une représentation Python (quotes
simples, `True`/`None`), que `json.loads` ne relit pas. L'historique des
paiements et le « dernier paiement par carte •••• 1234 » de la future page
d'abonnement ne pourraient pas s'en servir.

Reporté à l'étape 1 de `context/feature-spec/gestion-abonnement/api.md`
(correction d'une ligne, `json.dumps(event.raw)`) : c'est la route de paiement,
invérifiable de bout en bout sans compte marchand CMI, et aucun paiement réel
n'a encore eu lieu, donc aucune donnée n'est perdue en attendant.

### La course `task_match_team` du mode express, corrigée mais non vérifiée en réel

`adjuja-backend/app/tasks/ao_tasks.py`

`task_generate_note_metho` lit `AoTeamMember`, produit par `task_match_team` qui
était lancé détaché au même instant que le chord : la note méthodologique
pouvait partir **sans équipe, en silence**.

Corrigé le 2026-09-12 (le matching précède le chord quand une note est au
programme), mais **jamais vérifié sur un AO réel**. C'est une modification du
chord de production, que la spec `mode-accompagne/api.md` identifie comme le
risque principal du chantier.

Test de bout en bout reporté le 2026-09-13 avec celui du mode accompagné, sur
décision de l'utilisateur : les clés d'API des modèles ne sont pas encore
disponibles, or le pipeline en dépend dès l'analyse. Vérifié jusqu'ici au niveau
code seulement (tests unitaires, chargement des tâches dans les workers). À
rejouer dès que les clés sont en place, **sur un AO dont les PDF contiennent du
texte** : l'AO 599 est scanné et s'arrêterait à l'étape d'analyse.

---

## À CONFIRMER

### Ports de production publiés sur toutes les interfaces (MinIO, veille sans authentification)

`adjuja-infra/docker-compose.yml`

Relevé le 2026-09-29 en cadrant le test d'intrusion du panneau
d'administration. Sont publiés sur `0.0.0.0` : 8000 (API), **8001 (API de
veille, aucune authentification)**, 8002 (notifications), 8090 (frontend),
**9010 et 9011 (API et console MinIO : tous les documents des clients)**.
Docker insère ses propres règles et **contourne `ufw`** : seul le pare-feu
Hetzner peut fermer ces ports. Non vérifié depuis l'extérieur.

À confirmer depuis une machine hors du serveur :
`curl -m 5 http://46.224.154.138:<port>/` pour chaque port. Si l'un répond :
publier les ports sur `127.0.0.1` seulement (`"127.0.0.1:8000:8000"`) ou les
retirer, le proxy HTTPS de l'hôte restant le seul point d'entrée.

### Fichiers de dossier AO stockés en `.pdf` sans en être

`adjuja-watcher/app/workers/tasks/download_tasks.py`, branche zip de
`_download_and_classify`

Chaque membre du ZIP est stocké sous `{label}.pdf` avec
`content_type=application/pdf`, sans regarder l'extension réelle. Constaté sur
un zip de `.doc` Word le 2026-08-17, **reconfirmé le 2026-09-13** sur l'AO 599 :
`BOQ_AOO-PM -2026-4865.xlsx` est stocké sous `bordereau_des_prix.pdf`.

Le renommage est certain ; reste à établir l'impact en aval (tout
`fitz.open(..., filetype="pdf")` sur ce fichier échouera) avant de passer en
OUVERT.

### En dev, le worker de veille ne peut pas joindre le service de notifications

`adjuja-infra/docker-compose.dev.yml`, service `ao-watcher-worker`

Relevé le 2026-09-13 en lisant le bloc du service :
`NOTIFICATION_SERVICE_URL: http://localhost:8002`. Dans un conteneur,
`localhost` désigne le conteneur lui-même, pas le service de notifications ; et
ce service ne figure de toute façon pas dans le compose de dev. Tout appel du
worker vers les notifications échoue donc en dev.

À confirmer : quel code du worker appelle réellement ce service et avec quel
effet visible, et si la prod utilise bien l'adresse du réseau Docker. Sans
incidence sur la prod tant que ce second point est vérifié.

### Bucket MinIO non garanti côté watcher

`download_tasks.py` / `download_bdc_tasks.py` n'appellent pas `_ensure_bucket()`
avant `put_object`, contrairement au client MinIO de l'application principale.
Si le bucket est supprimé ou recréé sans lui, le téléchargement de DAO échoue
avec `NoSuchBucket`. Recréé manuellement en prod le 2026-07-05, jamais corrigé
au niveau du code.

---

## CORRIGÉ

### Dev : les migrations neuves n'étaient pas appliquées sans reconstruire l'image

`adjuja-infra/docker-compose.dev.yml`, service `api`

Trouvé le 2026-09-30 en vérifiant la migration 018. En développement, seul
`adjuja-backend/app/` était monté dans le conteneur ; `alembic/` venait de
l'image (construite deux semaines plus tôt, sans les migrations 015 à 018).
`app.scripts.migrate` s'arrêtait donc à une tête périmée pendant que le code
monté utilisait déjà les nouvelles tables. Corrigé le même jour : `alembic/`
est monté aussi. Vérifié par le démarrage de l'API de développement (voir
le suivi de l'étape 2 du panneau d'administration).

### Email de veille : « N° » affiche l'identifiant interne du portail, pas la référence de l'avis

`adjuja-watcher/app/modules/ao_scraper/mpe.py` (`fetch_detail`), `adjuja-notification/app/templates/ao_digest.py`

Trouvé le 2026-09-30 sur une demande de l'utilisateur (« la référence aussi »).
L'email affiche `N° 1030962` : c'est `external_id`, le `refConsultation` interne
du portail, que personne ne retrouve dans l'avis ni dans le dossier. La vraie
référence (`10012003`, champ `..._reference` de la fiche) est déclarée dans les
configurations (`reference_human`) mais **jamais lue** par `fetch_detail` ni
enregistrée : aucune colonne ne peut la recevoir. La corriger demande une colonne
`reference` dans `watcher.scraped_aos`, donc une migration, soumise à
l'utilisateur avant tout code (`CLAUDE.md`).

**Corrigé le 2026-09-30** (migration validée par l'utilisateur) : colonne
`reference` ajoutée au démarrage de l'API et du worker de la veille
(`app/core/schema.py`, `ADD COLUMN IF NOT EXISTS`), lue par `fetch_detail`
(vérifié sur une fiche réelle : `10012003`), protégée par `COALESCE` dans
l'upsert, remplie pour les AO ouverts par `rattraper_details.py`. L'email
affiche « Réf. 10012003 », la fiche de l'application aussi. Non vérifié sur une
base (Docker bloqué par le disque plein) : à contrôler au déploiement.


### Notifications : la veille quotidienne ne partait qu'un jour sur deux

`adjuja-notification/app/workers/tasks/batch_tasks.py` (`run_notification_batch`)

Signalé comme « problème d'envoi » le 2026-09-29. Les journaux de production ne
montrent **aucun échec Resend** : le système ne tentait simplement pas
d'envoyer. Chaque tick horaire répondait « aucune org due ».

Cause : la cadence comparait des durées à la milliseconde. `last_notified_at`
est écrit à la fin de l'envoi (28/09 09:00:00,109 UTC) ; le tick du lendemain
part à 09:00:00,017, soit 23 h 59 min 59,9 s, « pas dû », et la tranche
horaire de l'organisation était perdue pour la journée. Une veille quotidienne
partait un jour sur deux, une hebdomadaire une semaine sur deux.

**Corrigé, vérifié sur PostgreSQL** avec les horodatages de production : la
cadence est comptée en jours calendaires à l'heure du Maroc (cas de production
« pas dû » -> « dû » ; même jour et J+6 hebdomadaire restent « pas dû »).

Constaté au même moment : une organisation était **activée avec 0 secteur**,
donc exclue de tout envoi sans le savoir. `PUT /preferences` refuse désormais
l'activation sans secteur (400, message affiché par l'écran des préférences ;
test `adjuja-notification/tests/test_preferences.py`). Et la liste des secteurs
était convertie en JSON par `str(...).replace("'", '"')`, cassé par une
apostrophe : remplacé par `json.dumps`.

### Veille : chaque re-scrape effaçait estimation, caution et secteur des AO

`adjuja-watcher/app/modules/ao_scraper/repository.py` (`upsert_many`)

Constaté le 2026-09-29 à partir d'un email de veille affichant « Estimation :
non précisé / Caution : non précisé ». Ces champs viennent de la page détail,
lue une seule fois à la découverte de l'AO ; chaque re-scrape de liste (toutes
les 6 h) les réécrivait avec NULL. Mesuré : 134 AO sur 1 098 avec estimation et
caution (12 %) alors que le portail les publie (vérifié sur les pages des AO
1042516 et 1043294). Les codes de secteur, recalculés sans le secteur,
s'appauvrissaient : 53 % des AO sans aucun code, donc jamais notifiés.

**Corrigé et vérifié** : `COALESCE` sur estimation, caution et secteur, codes de
secteur conservés tant que la liste n'apporte pas de secteur. Vérifié sur la
base locale dans une transaction annulée (valeurs conservées), contre-épreuve
avec l'ancien code (valeurs effacées). Rattrapage des AO ouverts :
`adjuja-watcher/rattraper_details.py` (simulation par défaut ; vérifié sur
l'AO 1030962, estimation 1 779 718,56 et caution 35 000 restaurées).

### Notifications : les AO découverts après leur publication n'étaient jamais envoyés

`adjuja-notification/app/workers/tasks/batch_tasks.py` (`notify_org`)

Constaté le 2026-09-29 (« je reçois peu d'appels d'offres »). La sélection
retenait `date_publication >= dernier envoi`, or la veille découvre la plupart
des AO 1 à 10 jours après leur publication (mesuré : 295 le jour même, 244 le
lendemain, 113 à J+2, 149 à J+3, des dizaines au-delà d'une semaine). Tout AO
publié avant l'envoi précédent mais découvert après était écarté pour toujours.

**Corrigé** : sélection sur la date de découverte (`scraped_at`), AO encore
ouverts seulement, échéance la plus proche d'abord ; le `NOT EXISTS` sur
`notification_log` empêche toujours les doublons. Mesuré sur la même journée :
4 AO avec l'ancienne règle, 18 avec la nouvelle. Au passage : la newsletter ne
transmettait ni estimation, ni caution, ni ville, ni type (toujours « non
précisé ») ; l'envoi de test incluait des AO échus. Les deux sont corrigés.

### Email de veille : en-tête illisible dans Outlook, textes trop petits

`adjuja-notification/app/templates/ao_digest.py`

En-têtes en dégradé CSS (ignorés par Outlook et plusieurs webmails : texte blanc
sur fond blanc), textes à 11,5 px, valeurs en vert d'eau peu contrastées, ville
en double (« EL KELAA DES SRAGHNA...EL KELAA DES SRAGHNA »), montants arrondis.
**Refait le 2026-09-29**, dans l'univers du site à la demande de l'utilisateur :
fond spatial, bandeau de la Terre rendue en 3D depuis la texture du site,
centrée sur le Maroc avec un signal sur Rabat, lune en pied
(`adjuja-notification/outils/rendre_images_email.py` -> `public/email/`).
Couleurs pleines (pas de dégradé), compte à rebours de l'échéance, objet en
grand, estimation, caution et type sur une rangée, montants exacts, ville
dédoublonnée, préfixe « Acheteur : » retiré, contenu du portail échappé ; lisible
images bloquées. Vérifié par capture Chromium. Premiers tests du service
(`adjuja-notification/tests/`, 5 verts).

### Route équipe d'un AO : aucun contrôle d'appartenance (faille)

`adjuja-backend/app/api/routes/staff_cvs_routes.py`, `GET /staff-cvs/ao/{ao_id}/team`

Trouvé le 2026-09-28 en branchant l'équipe proposée dans le mode accompagné. La
route ne vérifiait pas que l'AO appartient à l'organisation de l'utilisateur :
tout utilisateur connecté lisait la composition d'équipe (rôles, profils visés,
alertes) de l'AO d'une autre entreprise à partir de son identifiant. Les CV
restaient filtrés par organisation.

**Corrigé le même jour, vérifié par test** (`tests/integration/test_remplacement_document.py`) :
404 pour une autre organisation, 200 pour la propriétaire (contre-épreuve : le
404 ne vient pas d'une mauvaise adresse).

### Les documents scannés ne sont jamais lus : pas d'OCR sur le chemin d'analyse

`adjuja-watcher/app/modules/ao_scraper/analysis.py` et
`adjuja-backend/app/tasks/ao_tasks.py`, `task_analyze_ao_context`

Constaté le 2026-09-13 sur l'AO 599 : CPS et RC sont des scans (30 pages pour
30 images et 0 caractère ; 17 pages pour 17 images et 0 caractère). L'extraction
PyMuPDF n'en tire rien. Le conteneur de veille n'a ni `tesseract` ni
`pytesseract` ; le backend dispose d'un OCR (utilisé pour l'ingestion RAG) qui
n'est pas branché sur ce chemin.

**Mesure du 2026-09-27** : sur les 5 AO de veille dont les documents sont
téléchargés, 4 ont un CPS et un RC entièrement scannés (0 caractère de texte :
AO 599, 600, 3389, 6387) ; seul l'AO 3412 a une couche texte. Ce n'est donc pas
un cas marginal : la plupart des analyses de veille échouent pour cette raison.
Et en dev, même l'AO 3412 échouerait ensuite à l'appel Mistral (clé factice).

**Veille : corrigé le 2026-09-27 (Tesseract).** `app/modules/ao_scraper/ocr.py`
+ tâche `ocr_tasks.ocr_ao_documents` : pages rendues à 300 dpi, lues par
Tesseract 5 (`fra`, ajouté à l'image du watcher), texte mis en cache sur MinIO
(`<clé>.ocr.txt`), partagé par tous les utilisateurs. La route du verdict répond
202 avec la progression pendant l'OCR ; le panneau affiche « page X / N » et
rappelle jusqu'au verdict. Vérifié sur l'AO 6387 : 53 pages lues en ~80 s
(~0,65 page/s), 119 707 caractères, texte fidèle (accents, références de
décret) ; analyse suivante sans nouvel OCR en 0,5 s. L'appel au modèle échoue
ensuite en dev (clé factice) avec un message clair.
**Pipeline : corrigé le 2026-09-27** (`app/services/ocr_service.py`, appelé par
`task_analyze_ao_context`) : même repli Tesseract, cache `<clé>.ocr.txt`.
Vérifié dans le worker `celery-cpu` sur le RC scanné de l'AO 6387 : 23 pages en
43 s à froid, 0,01 s depuis le cache. Deux défauts de la première version, trouvés
au test réel et corrigés : l'analyse partait dès le CPS lu sans attendre le RC,
et une erreur du modèle remontait en 500 brut.

Les **symptômes** ont été traités le 2026-09-13 (voir CORRIGÉ : diagnostic faux
et absence de signal). Le **fond** reste ouvert : un AO dont le DCE est scanné ne
peut pas être analysé automatiquement. Correction envisagée : repli OCR quand
l'extraction renvoie un texte vide, en réutilisant la chaîne OCR du backend.

### Les migrations Alembic n'étaient jamais appliquées : le schéma venait de `create_all`

Relevé le 2026-09-25, **incident de production le 2026-09-27** (tableau de bord
en 500 : `appels_offres.mode` et `date_limite` absentes, ajoutées à la main sur
le serveur). **Corrigé le 2026-09-28, vérifié sur quatre bases réelles.**

- `create_all` retiré du démarrage (`app/main.py`).
- `app/scripts/migrate.py`, lancé par le conteneur `api` avant uvicorn
  (Dockerfile, deux étages, et `docker-compose.dev.yml`) ; jamais par les
  workers. Trois cas : base suivie par Alembic -> `upgrade head` ; base vide ->
  toutes les migrations ; ancienne base `create_all` (production, dev) ->
  dernier `create_all`, estampille 016, puis 017.
- Migration **017, rattrapage idempotent** : colonnes des migrations 011 à 014,
  `company_profiles.lu_et_accepte_minio_key` et la table
  `newsletter_subscribers` (ajoutées aux modèles sans migration), deux index
  (`marches.org_id`, `users.verification_token`), règles de suppression
  d'`ao_team_members`.
- **Bug de production corrigé au passage** : sans `ON DELETE SET NULL` sur
  `ao_team_members.staff_cv_id` (absent des bases `create_all`), supprimer un
  CV affecté à une équipe violait la clé étrangère (500). Reproduit, puis
  vérifié corrigé : le membre d'équipe est détaché.
- Vérification : base suivie (016), base `create_all` récente, base imitant la
  production avant l'incident (colonnes, table et règles absentes, avec
  données), base vide. Toutes finissent en 017 avec le même schéma (seule
  nuance : l'unicité email/slug/profil y est une contrainte ou un index unique,
  même garantie), données conservées, second démarrage sans effet.
- La CI applique les migrations sur une base vide avant les tests : la chaîne
  est vérifiée à chaque push.

### nginx du frontend perdait l'API quand un service était recréé seul (502)

Constaté en production le 2026-09-27 après la rotation de `JWT_SECRET_KEY`
(connexion Google en « service momentanément indisponible »). **Corrigé le
2026-09-28, vérifié** sur un banc reproduisant l'incident : après recréation
d'`api` avec une nouvelle IP, l'ancienne configuration répond 502, la
nouvelle 200 sans redémarrage de nginx.

`adjuja-frontend/nginx.conf` : `resolver 127.0.0.11 valid=10s` et variables
dans `proxy_pass` (résolution à chaque requête). Pour `/watcher/` et
`/notifications/`, la variable supprime le retrait automatique du préfixe :
remplacé par un `rewrite` explicite ; chemins transmis vérifiés identiques à
l'ancienne configuration.


### Tests et CI backend : la CI ne tournait plus du tout, trois bugs réels dessous

Corrigé le 2026-09-27, vérifié : 104 tests passent, trois exécutions de suite.

- **Trois tests orphelins** (`test_worker_config.py`, `test_worker_db.py`,
  `test_worker_scraper.py`) importaient `worker/`, sorti du dépôt : `pytest`
  échouait à la collecte. Supprimés (accord de l'utilisateur) ; ce code vit
  désormais dans le watcher.
- **La CI ne tournait pas** : le workflow était dans
  `adjuja-backend/.github/workflows/`, que GitHub ignore (seul
  `.github/workflows/` à la racine compte). Déplacé en
  `.github/workflows/backend.yml`, avec un PostgreSQL de service. Lint limité
  aux vraies erreurs (`--select E9,F,ASYNC`), seuil de couverture ramené au
  niveau réel (33 %, mesure 34 %) au lieu d'un 60 % jamais tenu.
- **Tests dépendants de l'état de la base** : le compteur d'usage global n'était
  pas mocké et s'incrémentait dans la vraie base ; à 50 appels
  (`max_appels`), `/generate` répondait 429 et les tests échouaient. Idem pour
  le limiteur en mémoire. `tests/conftest.py` isole les deux.

Bugs de production trouvés par les vérifications, corrigés :

- **`filler_orchestrator.py` utilisait `fitz` sans l'importer.** Le `NameError`
  était avalé par `except Exception: return False` : la détection des PDF à
  encodage de police corrompu **n'a jamais fonctionné**, ces documents
  n'étaient jamais envoyés vers l'OCR et le remplissage lisait du texte haché.
- **Type MIME des images de profil fixé par le client.** Signature, cachet et
  « lu et accepté » étaient stockés dans MinIO avec `file.content_type` : un PNG
  valide déclaré `text/html` aurait été servi comme une page web (injection de
  script). Le type est maintenant déduit des octets déjà validés.
- **`/health` bloquait le serveur** : appel HTTP synchrone vers Qdrant dans une
  fonction asynchrone, jusqu'à 2 s de gel de toute l'application à chaque
  healthcheck Docker (30 s). Passé en client asynchrone.


### `JWT_SECRET_KEY` exposée publiquement et identique à celle de production

La clé est en clair dans `.env.example`, présent dans l'historique GitHub depuis
le commit `2635b21`, et identique à celle réellement utilisée
(`adjuja-infra/.env`). Quiconque accède au dépôt peut forger des tokens
d'authentification valides.

Le fichier a été corrigé (placeholder) le 2026-09-12, **mais la valeur reste
dans l'historique** : seule une rotation de la clé règle le problème.

**Corrigé le 2026-09-27 : rotation faite par l'utilisateur en production.**
Nouvelle clé de 64 caractères (`openssl rand -hex 32`) dans
`adjuja-infra/.env` du serveur, puis `up -d --force-recreate` des quatre
services qui la lisent : `api`, `celery-io`, `celery-cpu`, `notification-api`
(un simple `restart` ne relit pas le `.env`). Toutes les sessions ont été
invalidées. La clé exposée dans l'historique ne signe plus rien. Reste à
donner aussi une valeur propre au `.env` de développement, pour que dev et
production ne partagent plus jamais une clé.

### Veille : les AO échus réapparaissaient, et leurs fichiers restaient sur MinIO

`adjuja-watcher/app/modules/ao_scraper/repository.py`, `bdc_scraper/repository.py`,
`app/workers/tasks/cleanup_tasks.py`

Signalé par l'utilisateur le 2026-09-27 (liste de veille pleine d'AO « en
retard de 726 jours »). Mesure : 248 AO échus en `new`/`seen`, échéances depuis
2017. Le nettoyage nocturne fonctionnait (lancé à la main : 248 supprimés),
mais chaque scrape, toutes les 6 h, **réinsérait** ces avis encore listés par
les portails, en statut « nouveau ». Second défaut : le nettoyage supposait
qu'un élément hors favoris n'avait jamais de fichier ; faux pour un AO retiré
des favoris après téléchargement, dont documents, zip et cache OCR restaient
sur MinIO sans plus aucune ligne.
**Corrigé le 2026-09-27** : le scraper n'insère plus d'élément déjà échu (AO
et BDC) ; le nettoyage supprime aussi les fichiers (documents classés, cache
`.ocr.txt`, zip) des éléments retirés ; favoris et importés intacts. Vérifié
sur un scénario réel dans le worker : échu hors favori supprimé avec ses 2
fichiers, échu en favori conservé, avis de 2017 venu du scraper non inséré.

### Panneau BDC en colonne : il comprimait le tableau

`adjuja-frontend/src/features/veille/components/BdcDetailPanel.tsx`

Signalé le 2026-09-27. Le panneau AO était déjà un tiroir en superposition ;
celui des BDC était resté une colonne de 460 px à côté du tableau.
**Corrigé le 2026-09-27** : même tiroir, même voile, fermeture par Échap,
boutons alignés. Vérifié au typage, pas encore revu à l'écran.

### L'indexation RAG des documents d'entreprise et des CV n'a jamais fonctionné

`adjuja-backend/app/api/routes/company_documents_routes.py:159`,
`app/api/routes/staff_cvs_routes.py:301`, `app/services/rag_service.py`

Trouvé le 2026-09-27 en construisant le fit score. Les deux routes importent
`get_rag_service` depuis `app.services.rag_service`, qui ne l'a jamais défini
(il n'existait que dans `app.api.dependencies`). L'`ImportError`, avalée par
leur `try/except` (simple avertissement dans les logs), empêchait toute
indexation : aucun document d'entreprise ni CV envoyé n'est jamais arrivé dans
Qdrant. Reproduit dans le conteneur :
`ImportError: cannot import name 'get_rag_service'`.
**Corrigé le 2026-09-27** : `get_rag_service()` ajouté à `rag_service.py`,
`dependencies.get_rag_service` renvoie la même instance (vérifié : `True`).
Les documents déjà envoyés ne sont pas indexés rétroactivement : il faut les
réindexer (même réindexation que ci-dessous).

### Indexation RAG : le type de chaque document est écrasé en `note_metho`

`adjuja-backend/app/services/rag_service.py`, `index_document`

Trouvé le 2026-09-27 en écrivant la spec `fit-score`. Le payload de chaque point
est construit par `{**metadata, "content": ..., "org_id": ..., "doc_type": "note_metho"}` :
la clé posée en dernier gagne, donc le `doc_type` fourni par l'appelant
(`reference_realisation`, `diplome`, `pouvoir_gerance`… pour les documents
d'entreprise) est remplacé par `note_metho` pour **tous** les documents.
Aucune recherche ne peut filtrer par type réel.

### Indexation RAG : identifiants de points instables, doublons à la réindexation

`adjuja-backend/app/services/rag_service.py`, `index_document`

Trouvé le 2026-09-27. `id=abs(hash(f"{doc_id}_{i}"))` : `hash()` sur une chaîne
est salé à chaque démarrage de processus (`PYTHONHASHSEED` n'est fixé nulle
part dans l'infra). Réindexer le même document après un redémarrage produit
d'autres identifiants, donc des doublons au lieu d'un remplacement.

**Les deux corrigés le 2026-09-27** (étape 1 du fit score) : valeur par défaut
posée avant l'étalement, identifiants `uuid5` déterministes. Reste à faire :
réindexer les collections `offria_kb_{org_id}` existantes, dont les points
gardent l'ancien type ; impossible à vérifier sans vraie clé Mistral en dev.
Texte d'origine du report :, dont elles sont le préalable. Chacune
tient en une ligne, mais elle demande une réindexation des collections
`offria_kb_{org_id}` existantes, invérifiable sans vraie clé Mistral en dev
(voir « Questions ouvertes » du tracker) : les corriger sans pouvoir réindexer
laisserait les anciens points dans leur état faux.

### Aperçu : les pages de documents scannés s'affichaient presque blanches

`adjuja-frontend/src/shared/ui/DocumentPreview.tsx`, `vite.config.ts`

Signalé par l'utilisateur le 2026-09-27 (RC de l'AO 6387, page 4 : seul un fond
gris et quelques fragments visibles). Ces scans superposent une image de fond
et des dizaines de masques noir et blanc compressés en fax CCITT. pdf.js 6
décode le CCITT et le JBIG2 par un module WebAssembly
(`JBig2CCITTFaxImage`, `pdf.worker.mjs`) qu'il charge depuis l'option
`wasmUrl` ; l'aperçu ne passait que l'URL du fichier, donc ces couches
n'étaient jamais décodées. Rendu de contrôle par PyMuPDF : page parfaitement
lisible, le PDF n'était pas en cause.
**Corrigé le 2026-09-27** : `wasmUrl`, `cMapUrl`, `standardFontDataUrl`,
`iccUrl` passés à `getDocument`, ressources servies sous `/pdfjs/` par un
plugin Vite (dev : depuis `node_modules`, build : copiées dans `dist/pdfjs/`).
Vérifié : ressources servies en dev avec leur taille et leur type
(`application/wasm`). Pas encore revu à l'écran, pas testé sur un build de prod.


### Aucun chemin dans l'application pour changer de plan ou s'abonner

`adjuja-frontend/src/App.tsx:302`, `shared/layout/LeftPanel.tsx:550`,
`features/company/components/SubscriptionCard.tsx`

Trouvé le 2026-09-27. La grille des offres in-app (`PricingModal`) ne s'ouvre
que depuis le bouton du formulaire de génération de `LeftPanel` -- formulaire
lui-même inatteignable (voir « Le formulaire de génération n'est atteignable
par aucun chemin » plus haut). `SubscriptionCard`, qui portait l'abonnement et
ses actions, n'est plus rendue nulle part depuis que la « Vue d'ensemble » est
devenue le tableau de bord. Reste la carte « Plan » du tableau de bord
(`PlanCard`), en lecture seule. Un utilisateur connecté ne peut donc ni
s'abonner ni changer d'offre depuis l'application.

### Prix contradictoires : 79 € / 249 € dans l'application, 490 / 990 MAD sur le site

`features/billing/components/PricingModal.tsx:6,25`,
`features/landing/components/PricingSection.tsx:234,251`

Trouvé le 2026-09-27. La grille in-app affiche Starter 79 € et Pro 249 € ; la
page publique affiche Starter 490 MAD et Pro 990 MAD par mois. Le paiement
passe par CMI, en dirhams. À trancher par l'utilisateur : quels prix font foi
(et vérifier ce que le backend facture réellement). Textes de `PricingModal`
aussi en dur, hors i18n.

**Les deux corrigés le 2026-09-27.** Prix confirmés par l'utilisateur :
490 / 990 MAD, ceux du backend (`app/billing/plans.py`, Cabinet 2900 MAD).
`PricingModal` refaite : prix et noms d'offre lus sur `GET /billing/plans`
(plus de copie en dur), avantages repris des clés i18n de la page publique,
paiement par `startCheckout` (CMI) au lieu des liens Stripe et Calendly,
offre actuelle signalée, textes en i18n. Point d'entrée permanent : lien
« Changer d'offre » au pied de la carte « Plan » du tableau de bord ; la
modale s'ouvre toujours sur limite atteinte. `SubscriptionCard`, jamais
rendue, supprimée. Vérifié au typage (`tsc` propre) ; pas encore rejoué à
l'écran, et le paiement réel reste soumis à la configuration CMI.

### Veille BDC : un filtre par nature de prestation vide affichait « aucun bon de commande »

`adjuja-frontend/src/features/veille/BdcPage.tsx`

Trouvé le 2026-09-27 en unifiant les deux listes de veille. Le test « un filtre
est-il actif ? » de la page ignorait `nature_prestations` (le panneau de
filtres, lui, le comptait) : un filtre par nature sans résultat affichait
l'état vide générique au lieu de « aucun résultat pour ces filtres ».
**Corrigé le 2026-09-27**, vérifié au typage, pas encore rejoué à l'écran.


### Veille BDC : un filtre par nature de prestation vide affichait « aucun bon de commande »

`adjuja-frontend/src/features/veille/BdcPage.tsx`

Trouvé le 2026-09-27 en unifiant les deux listes de veille. Le calcul « un
filtre est-il actif ? » de la page ignorait `nature_prestations` (le panneau de
filtres, lui, le comptait). Un filtre par nature sans résultat affichait donc
l'état vide générique au lieu de « aucun résultat pour ces filtres ».
**Corrigé le 2026-09-27** : `nature_prestations.length > 0` ajouté au test.
Vérifié à la lecture et au typage, pas encore rejoué à l'écran.

### Un faux cachet « CACHET » était apposé sur les documents signés

`adjuja-backend/app/services/signing_service.py`, `app/api/routes/signing_routes.py`

Signalé par l'utilisateur le 2026-09-27, capture à l'appui : en fin de page, un
cercle violet « CACHET » sur carré blanc opaque, qui masquait le plan en
dessous. Quand ni l'envoi ni le profil entreprise ne fournissaient de cachet,
le service générait ce tampon factice (et, pour la signature, un rectangle
« Signé électroniquement »). Même effet dans le pipeline AO
(`task_sign_and_compile`) pour une organisation sans cachet au profil. Le
service lisait aussi `data/assets/cachet.png` s'il existait : une image unique
pour toutes les organisations, donc un cachet d'une entreprise apposable sur
les pièces d'une autre.

**Corrigé le 2026-09-27.** Tampons factices et lecture de `data/assets/`
supprimés : sans image, rien n'est apposé pour elle. La route refuse (400, message
explicite affiché par le frontend) un paraphe sans aucune signature, et une
signature sans signature ni cachet, au lieu de rendre un PDF inchangé.
Vérifié en exécutant `sign_pdf` sur un vrai PDF : 0 image apposée sans
tampon fourni, 1 avec un cachet seul, 2 avec signature et cachet, erreur
explicite pour un paraphe sans image. Pas encore rejoué dans l'application.

### La date limite d'un AO importé de la veille était perdue

`adjuja-backend/app/api/routes/ao_routes.py`, `import_from_watcher` et
`app/db/models.py`, `AppelOffre`

Trouvé le 2026-09-15 en préparant `dashboard-collaboratif`. Le watcher envoyait
`date_limite`, `categorie` et `region` à chaque import, `FromWatcherPayload` les
déclarait, et le handler ne les écrivait nulle part : la table `appels_offres`
n'avait **aucune colonne de date limite**. L'échéance d'un AO en cours n'existait
donc pas dans l'application principale.

**Corrigé et vérifié le 2026-09-15** : migration `014` (colonne `date_limite`),
renseignée à l'import, à la création manuelle et par la nouvelle route
`PATCH /ao/{ao_id}`. Vérifié de bout en bout sur un import réel depuis la veille
(AO 4078, échéance `2026-11-04`) : valeur identique dans la veille, dans la
réponse de l'API principale et en base, contrôlée par requête SQL directe. L'AO
de test a été supprimé ensuite.

**Reste vrai** : `categorie` et `region` ne sont toujours pas stockés, faute de
colonnes. Non traité ici, personne ne les demande aujourd'hui. Les AO importés
avant cette correction restent sans date : la valeur n'a jamais été stockée.


### Les routes de lecture des bons de commande n'exigeaient pas l'authentification

`adjuja-watcher/app/modules/bdc_scraper/router.py` : `GET /bdc`, `GET /bdc/stats`,
`GET /bdc/{bdc_id}`

Trouvé le 2026-09-14 en lisant le router pour `download-dce-lenteur`. Leurs
équivalents AO exigent l'en-tête `Authorization` (`_require_auth_header`), ces
trois-là non : la liste des bons de commande suivis était lisible sans être
connecté, via le proxy `/watcher/`. Aucun autre service n'appelle ces routes
(recherche dans backend, notification et infra), et le frontend envoie déjà
l'en-tête.

**Corrigé et vérifié le 2026-09-14** par de vrais appels : sans en-tête, `GET /bdc`,
`/bdc/stats` et `/bdc/785` → 401 ; avec en-tête → 200.

### Une erreur de téléchargement temporaire s'affichait comme définitive

`adjuja-watcher/app/workers/tasks/download_tasks.py` et `download_bdc_tasks.py`

Trouvé le 2026-09-14. Avant chaque relance Celery, `_save_error` écrivait
`zip_error` en base : les panneaux AO et BDC passaient en « erreur » et cessaient
de surveiller, même quand la relance suivante réussissait.

**Corrigé et vérifié le 2026-09-14** : l'erreur n'est écrite qu'après la dernière
tentative, et l'étape `nouvelle_tentative` (n/4, délai) est exposée par l'API.
Relances épuisées sur l'AO 3412 (portail simulé en échec) : erreur écrite une
seule fois, après la 4e tentative. **Vrai échec du portail sur l'AO 5**
(`Page.goto: Timeout 30000ms`) : aucune erreur en base, l'API renvoyait
« tentative 1/4, relance dans 59 s », puis la 2e tentative a réussi. Une ancienne
erreur est aussi effacée à la remise en favori (vérifié sur l'AO 5).

### Une erreur permanente de téléchargement était retentée 3 fois pour rien

`adjuja-watcher/app/workers/tasks/download_tasks.py` et `download_bdc_tasks.py`

**Reproduit dans les logs réels** le 2026-09-13 : `AO 599 has no zip_url` relancée
3 fois à 60 s d'intervalle, soit ~3 min d'attente pour une erreur connue dès la
première seconde.

**Corrigé et vérifié le 2026-09-14** : `PermanentDownloadError` (inexistant, aucun
lien ou document) échoue tout de suite. Appel réel de la tâche sur un AO sans
lien : état `SUCCESS` avec l'erreur, aucune relance, erreur écrite une fois.

### Le délai `networkidle` faisait échouer le téléchargement des DCE

`adjuja-watcher/app/modules/ao_scraper/mpe.py`, `download_document`

Confirmé en réel le 2026-09-13 sur l'AO 599 (safakat, MADAEF) : après la
soumission du formulaire de demande de DCE,
`wait_for_load_state("networkidle", timeout=15000)` expirait
(`Timeout 15000ms exceeded`) et l'exception faisait échouer tout le
téléchargement (`Empty response from download URL`). **3 échecs sur 4
tentatives**, chacune de 27 à 83 s. Un portail qui garde une requête en
arrière-plan ne devient jamais « au repos », même quand le bouton de
téléchargement est déjà là.

**Corrigé et vérifié le 2026-09-13** : on attend le bouton de téléchargement
lui-même (`wait_for(state="attached", timeout=45000)`, même sémantique de
présence que l'ancien `count()`), avec un message explicite s'il n'apparaît
pas. Mesure réelle en appelant `download_document` directement (sans les
relances Celery, qui masqueraient les échecs) : **4 réussites sur 4** --
3 fois l'AO 599 (17,3 s, 9,7 s, 8,3 s ; ZIP de 23 Mo, 7 fichiers) et un AO
marchespublics en non-régression (12,4 s ; 3,5 Mo, 5 fichiers). Aucun autre
`networkidle` dans le watcher.

### Le RC (et d'autres pièces) n'étaient pas détectés au classement des documents

`adjuja-watcher/app/workers/tasks/download_tasks.py`, `CLASSIFICATION_RULES`

Trouvé le 2026-09-12 sur un AO MADAEF réel (AO 599) : 5 fichiers sur 6 classés
`autre_doc`, dont le règlement de consultation. Conséquence en chaîne :
`analysis.py` lisait `docs.get("rc")`, qui valait `None`, et l'analyse partait
avec le seul CPS sans aucun signal.

**Cause racine**, confirmée le 2026-09-13 sur les noms réels du ZIP :
`_download_and_classify` passe à `_classify` le **chemin complet** du membre, et
les DCE rangent leurs pièces dans un sous-dossier :

```
DCE_AOO-PM -2026-4865-VF/CPS_AOO-PM -2026-4865-VF.pdf
DCE_AOO-PM -2026-4865-VF/RC_AOO-PM -2026-4865-VF.pdf
DCE_AOO-PM -2026-4865-VF/BOQ_AOO-PM -2026-4865.xlsx
DCE_AOO-PM -2026-4865-VF/Avis_AOO-PM -2026-4865.pdf
```

L'ancienne règle `^rc` voyait « DCE_… » en tête de chaîne et ne pouvait jamais
correspondre. Le défaut n'était pas propre à safakat : l'AO 14
(marchespublics.gov.ma) n'a aucun CPS ni RC classé.

**Corrigé et vérifié le 2026-09-13** : `/` et `\` ajoutés aux frontières de mot,
règle BOQ ajoutée, règles `declaration_honneur` et `avis` ajoutées, règle CPS
laissée intacte. 16 cas sur 16 dans le vrai module du conteneur (6 chemins réels
et cas de non-régression), puis **re-téléchargement réel de l'AO 599** :
`cps` + 5 `autre_doc` → `cps`, `rc`, `bordereau_des_prix`, `avis` + 2
`autre_doc` (Descriptif, PGE). Nom d'origine désormais journalisé (`original=`).

Les AO déjà téléchargés gardent leur ancien classement tant qu'ils ne sont pas
re-téléchargés (c'est le cas de l'AO 14).

### Régression introduite par la première version de cette correction

Même fichier. La règle CPS avait aussi été resserrée sur un « mot isolé », sans
que rien ne l'exige ; validée sur des noms synthétiques, elle a fait perdre le
CPS de l'AO 599 (6 `autre_doc`). **Rétablie et vérifiée le 2026-09-13** par le
même re-téléchargement réel. Leçon : une règle de classement se valide sur les
noms réels du ZIP concerné, d'où la journalisation ajoutée.

### Les lots 2 et suivants d'un AO multi-lots n'étaient jamais analysés (veille)

`adjuja-watcher/app/modules/ao_scraper/analysis.py`

`docs.get("cps")` / `docs.get("rc")` ne lisaient qu'une clé chacun, alors qu'un
AO multi-lots stocke `cps`, `cps_2`, `cps_3`… Les lots 2+ étaient ignorés en
silence (cas réel connu : AO 6388 / refConsultation 1029951, 3 lots).

**Corrigé le 2026-09-13** : tous les lots sont lus, dans l'ordre, avec le budget
d'origine réparti entre eux. Vérifié sur 6 cas de collecte (dont 3 lots
désordonnés et un préfixe voisin `cps_annexe` non confondu) et, dans le vrai
conteneur, sur les CPS et RC réels de l'AO 599.

### Troncature muette du CPS et du RC avant analyse (veille)

`adjuja-watcher/app/modules/ao_scraper/analysis.py`

Le texte était coupé à 60 000 / 40 000 caractères sans aucun signal. **Corrigé le
2026-09-13** : la troncature est journalisée (caractères gardés et perdus) et
remonte dans `_analyse_meta` (`caracteres_perdus`, `partielle`), métadonnée
filtrée de l'affichage de l'étape « Compréhension » du mode accompagné.

### Même défaut multi-lots côté backend, avec en plus un écrasement

`adjuja-backend/app/tasks/ao_tasks.py`, `task_analyze_ao_context`

La tâche ne sélectionnait que `doc_type in ("cps", "rc")` — un `cps_2` importé de
la veille était ignoré — et sa boucle **écrasait** chaque CPS par le suivant :
sur plusieurs CPS téléversés, seul le dernier était analysé. Portée réelle : les
AO créés à la main, ceux importés de la veille réutilisant l'analyse déjà faite.

**Corrigé le 2026-09-13** : fonctions pures `_lot_rank` et `_assemble_lots`, de
même sémantique que la veille (les deux services ne partagent pas de code, d'où
une implémentation miroir plutôt qu'un module commun). 13 tests unitaires dans
`tests/unit/test_analyze_lots.py`, dont l'écrasement et l'ordre des lots ;
**39/39 tests backend verts**, workers Celery redémarrés et code vérifié chargé.

### Chaque re-scrape planifié effaçait le lien de téléchargement des DCE

`adjuja-watcher/app/modules/ao_scraper/repository.py`, `upsert_many`

Trouvé le 2026-09-13 en vérifiant la correction du classement : relancer le
téléchargement de l'AO 599 échouait avec `AO 599 has no zip_url`. Dans le
`ON CONFLICT DO UPDATE`, `zip_url` était écrasé par la valeur du listing, sans
`coalesce`, alors qu'il vient de l'enrichissement de la page détail. Mesuré : la
veille 591/591 AO marchespublics et 12/13 safakat avaient un lien ; après le
scrape de 23 h 57, 509 AO marchespublics et 13/13 safakat en étaient privés.

**Corrigé et vérifié le 2026-09-13** :
`func.coalesce(stmt.excluded.zip_url, ScrapedAo.zip_url)`, même protection que
`date_publication` / `ville` / `mode_passation`. Preuve dans le conteneur : upsert
réel d'un listing **sans** lien pour l'AO 599, relecture (lien présent et
inchangé), transaction annulée. Les AO déjà vidés retrouvent leur lien au
prochain enrichissement ou via `refresh_and_download_ao_zip` (vérifié sur l'AO
599).

### Documents scannés : diagnostic faux côté veille, aucun signal côté backend

`adjuja-watcher/app/modules/ao_scraper/analysis.py` et
`adjuja-backend/app/tasks/ao_tasks.py`

Symptômes du défaut OCR ouvert plus haut. La veille répondait « Aucun CPS ni RC
disponible, favorisez l'AO et attendez le téléchargement » alors que les
documents étaient là ; le backend envoyait un texte vide au modèle sans aucun
signal.

**Corrigé le 2026-09-13** : la veille distingue « aucun document » de « aucun
texte extractible » ; vérifié en appelant réellement `analyze_ao` sur l'AO 599,
qui lève le nouveau message avant tout appel au modèle. Les deux services
remontent `caracteres_lus` et `_analyse_meta.sans_texte`.

### `KeyError` sur tout AO sans RC, introduit puis corrigé le 2026-09-13

`adjuja-watcher/app/modules/ao_scraper/analysis.py`

La première version du correctif multi-lots indexait
`meta_rc["caracteres_perdus"]`, alors qu'un type absent a pour méta
`{"lots": 0}` : toute analyse d'un AO sans RC levait `KeyError`, le cas le plus
fréquent avant la correction du classement. Présent quelques minutes dans le
conteneur de dev, jamais commité ni déployé. **Corrigé** par `.get()`.


### `pytest` échoue à la collecte depuis `adjuja-backend/` : 3 tests orphelins du `worker/`

`adjuja-backend/tests/unit/test_worker_config.py`, `test_worker_db.py`,
`test_worker_scraper.py`

Relevé le 2026-09-25 en lançant la suite pour valider `/dashboard/at-risk`.

Ces trois modules importent `worker.config`, `worker.db`, `worker.models` et
`worker.scraper`. Or `worker/` est resté **à la racine du dépôt**, hors de
`adjuja-backend/`, lors de la découpe en dossiers par service (commit
`4861d00`) -- et `CLAUDE.md` le décrit comme du code mort, hors dépôts. Les
tests sont donc orphelins : leur cible n'est plus importable depuis le paquet
où ils vivent.

Conséquence : `pytest` lancé depuis `adjuja-backend/`, qui est **la commande
documentée dans `CLAUDE.md`**, s'arrête sur `Interrupted: 3 errors during
collection` et ne lance aucun test. Il faut trois `--ignore` pour obtenir un
résultat -- avec eux, **58 tests passent**.

Défaut de longue date, sans rapport avec le travail en cours : il date de la
découpe, pas d'une régression récente.

**Correction non appliquée dans la foulée, arbitrage nécessaire.** Les deux
issues suppriment ou déplacent de la couverture :

- `worker/` est déclaré mort et son remplaçant est `adjuja-watcher/`, qui n'a
  **aucun test** (`find adjuja-watcher -name "test_*.py"` ne renvoie rien).
  Supprimer les trois fichiers rendrait la suite verte mais ramènerait la
  couverture du service de veille à zéro ;
- les repointer sur `adjuja-watcher` n'est pas une réécriture d'import : la
  structure a changé (`worker/config.py` -> `adjuja-watcher/app/core/config.py`,
  `worker/scraper.py` -> `app/modules/{ao,bdc}_scraper/`), et les fonctions
  testées (`_extract_ref`, `_normalize_url`, `upsert_ao`) doivent être
  retrouvées une par une.

La seconde voie est la bonne -- c'est la seule qui donne enfin des tests au
watcher -- mais c'est un chantier à part, pas un correctif de passage.
