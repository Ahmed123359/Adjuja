# resultats-attribution / api.md

Backend de la collecte des résultats d'attribution, entièrement dans
`adjuja-watcher`. Voir `00-overview.md` pour le pourquoi. Pas de `client.md` :
la donnée est consommée par `concurrents/` et `fit-score/`.

**Périmètre décidé par l'utilisateur le 2026-09-13 : nouveaux résultats
seulement.** Aucun rattrapage de l'historique public (318 292 résultats BDC,
37 691 résultats définitifs AO sur les seuls 6 derniers mois).

## Ce que les portails exposent réellement (vérifié le 2026-09-13)

Sondes en lecture seule lancées depuis le conteneur `ao-watcher-worker`, une
recherche par portail, une dizaine de téléchargements au total. Rien n'est
supposé dans cette section.

| Source | Accès | Volume | Ce que le HTML donne |
|---|---|---|---|
| BDC résultats, `marchespublics.gov.ma/bdc/entreprise/consultation/resultat` | httpx GET, `?page=N`, 10 par page | 318 292 | référence, objet, acheteur, date et heure de publication du résultat, nombre de devis reçus, **attributaire + montant TTC** ou « Avis d'achat infructueux » |
| AO résultat définitif, marchespublics | Playwright, `&AllAnn` + `annonceType=4` | 37 691 (fenêtre par défaut de 6 mois) | procédure, catégorie, date de publication, référence, objet, acheteur, lieu. **Ni attributaire ni montant** |
| AO extrait de PV, marchespublics | idem, `annonceType=5` | non compté | idem |
| safakat.cdg.ma | idem, `annonceType=4` | 21 | idem |
| achats.cimr.ma | idem | 0 (« Aucun résultat ») | rien |

### Corrections apportées à `00-overview.md`

- `&AvisAttribution` **ne filtre rien** : le portail redirige vers `&AllAnn`
  (constaté sur marchespublics, avec et sans `index.php`). Le filtre réel est
  `#ctl0_CONTENU_PAGE_AdvancedSearch_annonceType`, dont les valeurs sont : `2`
  information, `4` résultat définitif, `5` extrait de PV, `6` rapport
  d'achèvement, `8` résiliation, `9` rapport de présentation.
- La liste des lignes AO a **la même structure** que celle des consultations
  (`table.table-results tbody tr`, mêmes `panelBloc*`) : les sélecteurs de
  `listing.cols` sont réutilisables tels quels, plus
  `span[id$='_reference']` pour la référence humaine (« 11/2026/CUAO »).
- La fiche d'une annonce (`EntrepriseDetailConsultation`, redirigée vers
  `EntrepriseDetailsConsultation`) n'affiche que le résumé de la consultation,
  avec « Type d'annonce : Annonce de résultat définitif ». **Le contenu du
  résultat est une pièce jointe** :
  `index.php?page=entreprise.EntrepriseDownloadAvisJAL&refConsultation=…&orgAcronyme=…&idAvis=N`.
- Une annonce de résultat a **son propre `refConsultation`** (1039108,
  1039050…), distinct de celui de la consultation d'origine. Vérifié en SQL :
  0 des 10 identifiants sondés n'existe dans `watcher.scraped_aos`, et aucune
  consultation d'origine n'y est retrouvable par l'objet (le nettoyage
  quotidien supprime les AO expirés non favorisés).

### Format des pièces jointes (échantillon réel)

| Type d'annonce | Fichiers sondés | Format |
|---|---|---|
| Résultat définitif | 5 marchespublics + 1 safakat (dans un ZIP) | **6/6 PDF scannés** : 1 page, 0 caractère, 1 image |
| Extrait de PV | 6 marchespublics | **3 `.doc` Word** (OLE), **2 PDF scannés** (3 et 4 pages, dont un nommé « WhatsApp Image… »), **1 PDF texte** |

Le PDF texte (AOS 02/ENCG/2026, `refConsultation=1039089`, `idAvis=532542`)
contient **tout ce que `award_bids` doit porter** : 6 concurrents ayant déposé,
écartés (néant), admis avec et sans réserve, montants des actes d'engagement
avant et après vérification, et « Concurrent retenu : BE DATA, 314 304,00 DH
TTC ». C'est la fixture de référence pour le lot B.

**Conséquence** : l'extrait de PV contient le retenu **et** les soumissionnaires.
Le résultat définitif ne donne que le retenu, et il est toujours scanné. Pour
obtenir des soumissionnaires, il faut extraire les PV : c'est du texte libre, dont
la mise en page varie selon l'acheteur.

## Découpage en deux lots

Le constat ci-dessus casse l'hypothèse de départ (« une entrée de config de plus,
la donnée est dans le listing »). Le chantier se scinde :

- **Lot A, implémentable sans arbitrage** : collecte continue des nouvelles
  annonces AO (types 4 et 5) avec l'URL de leur pièce jointe, et des nouveaux
  résultats BDC, attributaire et montant compris. Aucun OCR, aucun LLM.
- **Lot B, arbitrage requis** : extraction des soumissionnaires et montants
  depuis les pièces jointes AO. Voir « Lot B » plus bas.

`concurrents/` peut démarrer sur les données BDC du lot A. Côté AO, il faut le
lot B.

## Modèle de données (schéma `watcher`)

Deux tables neuves, créées par `init_db.py` (`Base.metadata.create_all`, pas
d'Alembic sur ce service). Des tables **neuves** sont bien créées par
`create_all`, contrairement à une colonne ajoutée à une table existante : aucun
`ALTER` n'est à documenter. Leur existence est quand même à **vérifier au `\d`**,
jamais d'après le message de succès (piège déjà vécu deux fois).

Horodatages en `DateTime(timezone=True)`, comme `scraped_aos` et `scraped_bdc`
dans ce même schéma. La convention `String` ISO 8601 est celle de l'application
principale, pas du watcher.

### `watcher.award_results`, une ligne par annonce ou résultat BDC

| Colonne | Type | Rôle |
|---|---|---|
| `id` | `Integer` PK | |
| `source` | `String(50)` | `marchespublics`, `safakat_cdg`, `marchespublics_bdc` |
| `type_resultat` | `String(20)` | `resultat_definitif`, `extrait_pv`, `bdc` (CHECK) |
| `cle_externe` | `String(255)` | AO : `refConsultation` de l'annonce. BDC : voir plus bas |
| `org_acronyme` | `String(20) \| null` | AO seulement, nécessaire pour reconstruire les URL |
| `reference` | `String(255) \| null` | référence humaine publiée (« 11/2026/CUAO », « 07/2026 ») |
| `objet` | `Text` | |
| `acheteur` | `Text \| null` | |
| `procedure` | `String(255) \| null` | AO seulement |
| `categorie` | `String(100) \| null` | AO seulement |
| `lieu_execution` | `Text \| null` | AO seulement |
| `date_publication` | `DateTime(timezone=True) \| null` | AO : date du listing (jour). BDC : date et heure du résultat |
| `nb_offres` | `Integer \| null` | BDC : « Nombre de devis reçus ». AO : rempli par le lot B |
| `est_infructueux` | `Boolean` | défaut `false` |
| `secteur_codes` | `JSONB \| null` | `match_secteurs(objet, None, None)`, même référentiel que `scraped_aos` |
| `url_source` | `Text` | |
| `pieces_jointes` | `JSONB \| null` | AO : `[{"id_avis", "nom", "url"}]` ; le lot B y ajoute `minio_key`, `format`, `caracteres` |
| `extraction_statut` | `String(20)` | `non_applicable` (BDC), `en_attente`, `extrait`, `echec` (CHECK) |
| `scraped_at`, `updated_at` | `DateTime(timezone=True)` | |

Contraintes et index : `UNIQUE (source, type_resultat, cle_externe)`, index sur
`date_publication`, `acheteur`, `extraction_statut`, GIN sur `secteur_codes`
(le filtre par secteur est la première requête dont `concurrents/` aura besoin).

**Clé BDC** : les cartes de résultat n'ont **aucun lien ni identifiant**
(vérifié sur le HTML brut, aucun attribut `data-*`). `cle_externe` =
`sha1(reference | acheteur | date_publication à la minute)`. Une référence
comme « 07/2026 » est réutilisée par des milliers d'acheteurs, elle ne suffit
pas seule.

### `watcher.award_bids`, N lignes par résultat

| Colonne | Type | Rôle |
|---|---|---|
| `id` | `Integer` PK | |
| `result_id` | FK `award_results.id` | `ON DELETE CASCADE` |
| `soumissionnaire` | `Text` | nom tel que publié |
| `soumissionnaire_normalise` | `Text` | majuscules, espaces réduits, forme juridique retirée (SARL, SARL AU, SA, SNC) |
| `lot` | `String(50) \| null` | |
| `montant_ttc` | `Numeric(15, 2) \| null` | après vérification si publié, sinon montant déposé |
| `statut` | `String(20)` | `retenu`, `admis`, `ecarte`, `inconnu` (CHECK) |
| `origine` | `String(20)` | `listing_bdc`, `extraction` (CHECK) |
| `created_at` | `DateTime(timezone=True)` | |

Index sur `soumissionnaire_normalise` et `result_id`.

**L'attributaire ne vit qu'ici**, jamais en double sur `award_results` : c'est la
ligne `statut = 'retenu'`. Deux sources de vérité pour la même donnée finissent
par diverger, ce projet en a déjà payé le prix plusieurs fois. Lot A : un
résultat BDC attribué produit une ligne `retenu`, `origine = 'listing_bdc'`. Un
résultat infructueux n'en produit aucune.

`award_results` n'est **jamais** purgé par `cleanup_expired_watcher_items` : sa
valeur tient à l'historique qu'il accumule.

## Code (lot A)

Nouveau module `app/modules/award_scraper/`, parallèle à `bdc_scraper/`. Le
scraper des consultations (`ao_scraper/mpe.py`) **n'est pas modifié** : c'est du
code en production, et la collecte des résultats n'a aucune raison de le mettre
en risque.

- `base.py` : dataclasses `AwardData` et `BidData`, même forme que `AoData`.
- `mpe.py` : `MPEAwardScraper(MPEPlatformScraper)`. Il hérite du chargement de
  config, du contexte Playwright, du client httpx, du proxy et de `_close`.
  Méthodes ajoutées : `fetch_notices(type_resultat, depuis)`, qui lit le listing
  filtré, et `fetch_notice_attachments(ref, org)`, qui lit les liens `idAvis` de
  la fiche.
- `bdc.py` : `BdcResultScraper`, en httpx + BeautifulSoup comme `BdcScraper`.
- `repository.py` : `AwardRepository.upsert_results` (`ON CONFLICT DO NOTHING`
  sur la contrainte unique : un résultat publié ne change pas, et une ligne déjà
  en base ne doit pas perdre ce que le lot B y aura écrit),
  `insert_bids`, `known_keys(source, type_resultat, depuis)`,
  `last_publication(source, type_resultat)`.
- `app/workers/tasks/scrape_award_tasks.py` : tâche `run_scrape_awards_pipeline`.

### Entrée de config `listing_attribution`

Ajoutée à `marchespublics.config.json` et `safakat_cdg.config.json`. Mise à
`null` dans `achats_cimr.config.json` : 0 résultat vérifié, et une recherche
vide y coûte 45 s de délai d'attente pour rien.

```json
"listing_attribution": {
  "path": "/?page=entreprise.EntrepriseAdvancedSearch&AllAnn",
  "annonce_type_select": "#ctl0_CONTENU_PAGE_AdvancedSearch_annonceType",
  "annonce_types": { "resultat_definitif": "4", "extrait_pv": "5" },
  "date_start_input": "#ctl0_CONTENU_PAGE_AdvancedSearch_dateMiseEnLigneCalculeStart",
  "search_button": "#ctl0_CONTENU_PAGE_AdvancedSearch_lancerRecherche",
  "rows": "table.table-results tbody tr",
  "no_result_text": "Aucun résultat",
  "cols": {
    "detail_link": "a[href*='EntrepriseDetailConsultation']",
    "reference": "span[id$='_reference']",
    "procedure": "div[id$='_type_procedure']",
    "categorie": "td.col-90 div[id*='panelBlocCategorie']",
    "date_publication": "td.col-90 > div:not([id]):not([class])",
    "acheteur": "td.col-450 div[id*='panelBlocDenomination']",
    "titre": "td.col-450 div[id*='panelBlocObjet']",
    "lieu": "td.col-90 div[id*='panelBlocLieuxExec']"
  },
  "attachment_link": "a[href*='EntrepriseDownloadAvisJAL'][href*='idAvis=']"
}
```

Pagination et nombre d'éléments par page : les sélecteurs `nbelem_select` et
`next_page_btn` du bloc `listing` existant sont présents sur la page de
résultats (vérifié), ils sont réutilisés tels quels.

Le lien `attachment_link` doit exiger un `idAvis` **non vide** : la fiche
contient aussi un lien `…&idAvis=` sans valeur (constaté sur les deux portails).

### « Nouveaux seulement » : le mécanisme

**AO.** Le listing est trié par date de publication décroissante (vérifié :
12/09, 12/09, 11/09, 11/09). Pour chaque couple `(source, type_resultat)` :

1. `depuis` = `last_publication(...)` moins 2 jours de recouvrement (la date du
   listing n'a pas d'heure, un résultat publié tard la veille ne doit pas passer
   entre deux runs). S'il n'existe encore aucune ligne : aujourd'hui moins
   `award_bootstrap_days`, nouveau réglage de `config.py`, **7 par défaut**.
2. Remplir `date_start_input` avec `depuis`, choisir le type, lancer la
   recherche, passer à 500 lignes par page.
3. Écarter les clés déjà connues. Pour chaque nouvelle annonce, **une** requête
   de fiche pour lire `idAvis` (1 à 2 s entre deux fiches, délais de la config).
4. Upsert. Aucun téléchargement de pièce jointe dans le lot A : on ne sollicite
   pas le portail gouvernemental pour des fichiers que personne ne lit encore.

Charge estimée : 37 691 résultats définitifs sur 6 mois, soit environ 200 par jour
sur marchespublics. Avec les PV, dont le volume n'a pas été mesuré, cela fait une
page de listing et quelques centaines de fiches par jour.

**BDC.** Le listing est lui aussi trié du plus récent au plus ancien (vérifié :
13/09 13:10 puis 11:41). On lit `?page=1, 2, …`, et on s'arrête à la première
page qui ne contient **que** des clés connues, comme `scrape_bdc_tasks.py`. Au
premier run, on s'arrête dès qu'une carte est plus ancienne que
`award_bootstrap_days`. Garde-fou `MAX_PAGES = 50`.

### Tâche et planification

- `run_scrape_awards_pipeline`, cooldown Redis `scrape:award:last_run` (même
  patron que les deux scrapers existants), `max_retries=2`.
- Ordre : BDC, puis pour chaque config ayant `listing_attribution`, les types
  `resultat_definitif` puis `extrait_pv`. L'échec d'une source est journalisé et
  n'arrête pas les suivantes, comme dans `_run_all_sources`.
- Beat : **une fois par jour à 03h30** Africa/Casablanca, après le nettoyage de
  02h00. Un résultat d'attribution n'a pas l'urgence d'un AO ouvert, et la nuit
  est le moment où l'on pèse le moins sur le portail.
- Aucun déclenchement de notification.
- Ajout à `include` et `beat_schedule` de `celery_app.py`.

### Endpoints

**Aucun dans ce chantier.** Le watcher n'expose aucun endpoint de déclenchement
de scrape aujourd'hui (tout passe par Beat, vérifié dans les routers), et les
lectures agrégées seront définies par `concurrents/api.md` d'après ses propres
besoins. Pour la vérification, la tâche se lance à la main :
`celery -A app.workers.celery_app call app.workers.tasks.scrape_award_tasks.run_scrape_awards_pipeline`.

## Lot B : extraction des pièces jointes (arbitrage requis)

Rien n'est à implémenter avant décision. Les faits qui la cadrent :

- **Seuls les extraits de PV valent l'extraction** : ils contiennent le retenu et
  les soumissionnaires. Les résultats définitifs ne serviraient qu'à confirmer
  l'attributaire d'une consultation dont le PV manque.
- Trois formats sont à traiter pour les PV : PDF texte (PyMuPDF, déjà dans
  l'image), `.doc` Word (l'image n'a aucun convertisseur, il faut ajouter
  `antiword` ou LibreOffice sans interface, ce dernier alourdissant nettement
  l'image), et scans (OCR).
- **L'OCR n'existe que dans l'image backend** (`pytesseract` +
  `tesseract-ocr-fra`, utilisés par `filler_page_detector.py`). L'invariant 1
  interdit d'importer ce code depuis le watcher. Il faudrait installer
  `tesseract-ocr-fra` dans l'image du watcher : c'est la même chaîne d'outils, pas
  du code partagé. C'est aussi le fond du défaut OCR déjà ouvert dans
  `bugs-connus.md` pour l'analyse des DCE : les deux besoins se règlent ensemble.
- La mise en page est libre. Une extraction fiable du texte vers les lignes
  `award_bids` passe par un LLM avec sortie JSON contrainte (Mistral, déjà
  configuré dans le watcher pour `analysis.py`). **Aucune clé valide en dev**
  (voir Questions ouvertes du tracker) : le lot B est invérifiable en conditions
  réelles tant que ce n'est pas réglé.

Options à trancher :

1. **Tout extraire** (environ 200 PV par jour, estimation) : complet, mais un
   téléchargement et un appel LLM par PV.
2. **N'extraire que les PV dont `secteur_codes` croise les secteurs suivis par
   au moins une org** : même donnée utile pour `concurrents/`, bien moins de
   charge sur le portail et de coût LLM. **Recommandé.**
3. Ne pas faire le lot B : `concurrents/` se limite aux BDC.

Critère de recette du lot B, quel que soit le choix : le PV `idAvis=532542`
doit donner exactement 6 soumissionnaires, BE DATA `retenu` à 314 304,00, et
les 5 autres `admis` avec leurs montants.

## Check (lot A)

- `\d watcher.award_results` et `\d watcher.award_bids` montrent les colonnes,
  la contrainte unique et les index, vérifiés en base et non d'après la sortie
  d'`init_db.py`.
- Un run réel crée au moins un résultat BDC avec sa ligne `award_bids` `retenu`
  et un montant, cohérent avec la carte du portail. Vérifié en SQL.
- Le même run crée des annonces `resultat_definitif` et `extrait_pv` pour
  marchespublics et safakat, chacune avec au moins un `idAvis` non vide dans
  `pieces_jointes`.
- **Un second run lancé juste après insère 0 ligne et s'arrête dès la première
  page** (BDC) ou sur un listing sans clé nouvelle (AO), visible dans les logs.
  C'est la preuve du « nouveaux seulement ».
- CIMR est ignoré sans le délai d'attente de 45 s.
- Non-régression : le scrape des consultations (`run_scrape_pipeline`) tourne
  comme avant, `ao_scraper/` n'ayant pas été touché.

## Open Questions

- **Lot B** : choix entre les options 1, 2 et 3 ci-dessus.
- Fenêtre d'amorçage de 7 jours : proposition, pas une décision.
- Paramètre GET `search_consultation_resultats[pageSize]=50` sur les résultats
  BDC : présent dans le formulaire, non testé. S'il fonctionne, le nombre de
  requêtes est divisé par 5.
- Fiche d'annonce AO lue en httpx plutôt qu'en Playwright : les fiches de
  consultation le sont déjà (`fetch_detail`), mais pour les annonces seul le
  passage par Playwright a été constaté, avec une redirection vers
  `EntrepriseDetailsConsultation`. À vérifier à l'implémentation, sinon une fiche
  coûte un onglet Chromium.
- **Rapprochement avec `scraped_aos`** : impossible par `refConsultation`. La
  seule piste est `(reference, acheteur)`. Or `scraped_aos` ne stocke pas la
  référence humaine : `detail.fields.reference_human` est déclarée dans les trois
  configs, mais `fetch_detail` ne la lit jamais. Nécessaire pour le facteur
  « Références similaires » de `fit-score/`, pas pour le lot A.
- Données personnelles : un soumissionnaire auto-entrepreneur est une personne
  physique nommée. La donnée est publiée par l'État, mais son stockage et son
  agrégation par ADJUJA relèvent de la charte loi 09-08 affichée sur
  `/confidentialite`. C'est à valider avant d'exposer `concurrents/`.
- Volume quotidien réel des extraits de PV et des résultats BDC : non mesuré, à
  lire dans les logs du premier run.
