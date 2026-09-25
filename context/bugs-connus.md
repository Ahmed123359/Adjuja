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

### Les documents scannés ne sont jamais lus : pas d'OCR sur le chemin d'analyse

`adjuja-watcher/app/modules/ao_scraper/analysis.py` et
`adjuja-backend/app/tasks/ao_tasks.py`, `task_analyze_ao_context`

Constaté le 2026-09-13 sur l'AO 599 : CPS et RC sont des scans (30 pages pour
30 images et 0 caractère ; 17 pages pour 17 images et 0 caractère). L'extraction
PyMuPDF n'en tire rien. Le conteneur de veille n'a ni `tesseract` ni
`pytesseract` ; le backend dispose d'un OCR (utilisé pour l'ingestion RAG) qui
n'est pas branché sur ce chemin.

Les **symptômes** ont été traités le 2026-09-13 (voir CORRIGÉ : diagnostic faux
et absence de signal). Le **fond** reste ouvert : un AO dont le DCE est scanné ne
peut pas être analysé automatiquement. Correction envisagée : repli OCR quand
l'extraction renvoie un texte vide, en réutilisant la chaîne OCR du backend.

### Règle de classement `plan` trop large

`adjuja-watcher/app/workers/tasks/download_tasks.py`, `CLASSIFICATION_RULES`

`plan|ccag|cahier.*charge` classe en `ccag` tout fichier dont le nom contient
« plan » : « planning », « plan de formation », « plan de charge »… Un plan n'est
pas un CCAG. Laissé tel quel le 2026-09-13 lors de la correction du RC, parce que
le retirer changerait le classement d'AO déjà traités : à reprendre avec une
vérification sur les AO existants.

---

## REPORTÉ

### `JWT_SECRET_KEY` exposée publiquement et identique à celle de production

La clé est en clair dans `.env.example`, présent dans l'historique GitHub depuis
le commit `2635b21`, et identique à celle réellement utilisée
(`adjuja-infra/.env`). Quiconque accède au dépôt peut forger des tokens
d'authentification valides.

Le fichier a été corrigé (placeholder) le 2026-09-12, **mais la valeur reste
dans l'historique** : seule une rotation de la clé règle le problème.

Reporté parce que c'est un **arbitrage d'exploitation** qui appartient à
l'utilisateur : la rotation invalide toutes les sessions actives et impose un
redéploiement.

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

### Trois tests orphelins cassent la CI backend

`tests/unit/test_worker_config.py`, `test_worker_db.py`, `test_worker_scraper.py`
importent `worker`, sorti du suivi git le 2026-07-02 sans que ses tests soient
supprimés. `pytest tests/` échoue à la collecte sur toute machine sans le dossier
`worker/` local, donc la CI GitHub Actions est rouge depuis cette date.

Supprimer des tests est un choix qui appartient à l'utilisateur.

---

## CORRIGÉ

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


### Les migrations Alembic ne sont jamais appliquées : le schéma vient de `create_all`

`adjuja-backend/app/main.py:34`, `adjuja-backend/alembic/versions/`

Relevé le 2026-09-25 en posant la migration 015 (`team_messages`).

Constat, vérifié en base et non supposé :

- la table `alembic_version` **n'existe pas** dans la base de développement :
  aucune migration n'a jamais été enregistrée comme appliquée ;
- `alembic upgrade head` **échoue immédiatement** :
  `asyncpg.exceptions.DuplicateTableError: relation "users" already exists`.
  Alembic repart de la révision 001 et tente de recréer des tables présentes ;
- le schéma réel est produit par `Base.metadata.create_all`, appelé au démarrage
  de l'application (`main.py:34`).

Les quinze migrations du dossier sont donc **décoratives** : elles décrivent
l'intention, rien ne les exécute.

**Pourquoi c'est dangereux et pas seulement inélégant.** `create_all` ne crée
que les tables MANQUANTES ; il n'ajoute jamais une colonne à une table qui
existe déjà. Tant qu'on repart d'une base vide, tout semble fonctionner -- c'est
le cas ici, `date_limite`, `mode` et `team_messages.refs` sont bien présents,
parce que cette base a été recréée après la mise à jour des modèles. Sur une
base qui a de l'historique, en revanche, une migration du type de la 014
(`ALTER TABLE appels_offres ADD COLUMN date_limite`) ne s'appliquerait
**jamais**, et l'application écrirait dans une colonne inexistante. C'est
exactement la famille de défaut qui a déjà coûté la perte silencieuse de
`date_limite` à l'import (voir plus haut dans ce registre).

**Correction non appliquée dans la foulée, arbitrage nécessaire.** Remettre la
chaîne d'aplomb demande de décider de l'état de départ, ce qui touche la base de
production :

- estampiller la base existante à la dernière révision
  (`alembic stamp head`) admet que les migrations 001 à 015 sont déjà reflétées
  par `create_all` -- vrai pour cette base de dev, à vérifier une par une pour la
  production avant d'en faire autant ;
- puis retirer `create_all` du démarrage, sans quoi les deux mécanismes
  continueront de se marcher dessus et le problème reviendra à la première
  colonne ajoutée ;
- et lancer `alembic upgrade head` au déploiement.

Tant que ce n'est pas fait, **toute migration qui ajoute une colonne doit être
considérée comme non appliquée** et vérifiée à la main en base.
