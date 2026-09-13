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

### Le délai `networkidle` fait échouer le téléchargement des DCE, pas seulement ralentir

`adjuja-watcher/app/modules/ao_scraper/mpe.py`, `download_document`

Confirmé en réel le 2026-09-13 sur l'AO 599 (safakat, MADAEF) : après la
soumission du formulaire de demande de DCE,
`wait_for_load_state("networkidle", timeout=15000)` expire
(`Timeout 15000ms exceeded`) et `download_document` renvoie une réponse vide,
d'où `ZIP download failed: Empty response from download URL`. **3 échecs sur 4
tentatives** observés dans la même demi-heure ; le même AO s'était téléchargé en
27 s la veille.

Le chantier `download-dce-lenteur` soupçonnait ce délai « sans mesure » ; il est
désormais observé, et son effet est pire que supposé (échec, pas lenteur).
Correction envisagée : attendre l'apparition du lien de téléchargement plutôt
qu'un réseau au repos, ou poursuivre malgré l'expiration du délai.

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
