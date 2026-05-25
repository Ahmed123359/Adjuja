# Architecture Worker de scraping OffrIA

## Vue d'ensemble

Le worker scrape le portail `marchespublics.gov.ma` et enrichit une base SQLite
partagée avec l'API principale. Il tourne en arrière-plan, de façon silencieuse,
sans interférer avec le reste de l'application.

```
┌─────────────────────────────────────────────────────────────┐
│  docker compose --profile worker up                         │
│                                                             │
│   main.py  ──►  scheduler.py  ──►  scraper.py              │
│                      │                                      │
│                      └──►  db.py  ──►  ao_catalog.db        │
└─────────────────────────────────────────────────────────────┘
```

---

## Séparation des responsabilités

| Fichier        | Rôle                                              | Dépendances         |
| -------------- | ------------------------------------------------- | ------------------- |
| `config.py`    | Variables d'environnement (`WORKER_*`)            | pydantic-settings   |
| `models.py`    | Dataclass `AOResult` (structure de données)       | aucune              |
| `db.py`        | Schéma SQLite, migration, upsert                  | models, config      |
| `scraper.py`   | Playwright : recherche + téléchargement           | models, config      |
| `scheduler.py` | Orchestration DB + scraper, APScheduler           | db, scraper, config |
| `main.py`      | Point d'entrée, SIGINT/SIGTERM, boucle principale | scheduler, config   |

**Règle fondamentale :** `scraper.py` ne touche jamais la base de données.
La DB est exclusivement gérée par `db.py`, appelé depuis `scheduler.py`.

---

## Flux d'un cycle de scraping

```
Scheduler déclenche run_scrape_job()
        │
        ├─ 1. init_db()
        │       └─ Ouvre (ou crée) ao_catalog.db
        │          Applique les migrations silencieuses si nécessaire
        │
        ├─ 2. Requête DB → known_refs
        │       └─ SELECT ref_consultation FROM appels_offre
        │          Résultat : set{"981730", "982877", ...}
        │
        ├─ 3. run_scrape(settings, known_refs)
        │       │
        │       ├─ Pour chaque acheteur dans WORKER_ACHETEURS :
        │       │       │
        │       │       ├─ _get_ao_links()          ← Étape 1 : liste uniquement
        │       │       │   Ouvre la recherche avancée
        │       │       │   Filtre par acheteur (autocomplete)
        │       │       │   Retourne [{"titre", "url", "acheteur"}, ...]
        │       │       │   Limite : WORKER_MAX_AOS résultats par acheteur
        │       │       │
        │       │       └─ Pour chaque AO dans la liste :
        │       │               │
        │       │               ├─ ref in known_refs ?
        │       │               │       OUI → log "ignoré" + skip
        │       │               │       NON → _download_dossier()
        │       │               │
        │       │               └─ _download_dossier()  ← Étape 2 : téléchargement
        │       │                   A. Ouvre la fiche de détail
        │       │                   B. Extrait les métadonnées (best-effort)
        │       │                      référence, objet, acheteur, procédure,
        │       │                      catégorie, contact, date limite
        │       │                   C. Clique "Dossier de consultation"
        │       │                   D. Remplit le formulaire de retrait
        │       │                      (nom / prénom / email fictifs)
        │       │                   E. Valide (PRADO AJAX)
        │       │                   F. Télécharge le ZIP
        │       │                   G. Retourne AOResult
        │       │
        │       └─ Retourne [AOResult, ...]  (nouveaux uniquement)
        │
        └─ 4. upsert_ao() pour chaque résultat
                INSERT ... ON CONFLICT(ref_consultation) DO UPDATE SET ...
                Statut : "disponible" si ZIP téléchargé, "erreur_scraping" sinon
```

---

## Déduplication

À chaque cycle, le scheduler charge les `ref_consultation` déjà présentes en base
avant de lancer le scraper. Les AOs déjà connus sont ignorés sans ouvrir leur fiche.

```
known_refs = {"981730", "982877"}

_get_ao_links() → [AO 981730, AO 982877, AO 983100, AO 983201]
                                                ↓
                              filtre known_refs
                                                ↓
                              [AO 983100, AO 983201]  ← nouveaux seulement
                                                ↓
                              _download_dossier() × 2
```

**Limitation connue :** si les métadonnées d'un AO existant changent (ex: date
limite modifiée), elles ne sont pas mises à jour. Seules les nouvelles AOs
déclenchent un téléchargement et un upsert.

---

## Gestion des IDs PRADO

Le portail utilise le framework PRADO (ASP.NET-like). Les IDs des composants
varient entre les pages :

- Page 981730 : `ctl0_CONTENU_PAGE_ctl5_reference`
- Page 982877 : `ctl0_CONTENU_PAGE_idEntrepriseConsultationSummary_reference`

**Solution :** sélecteur CSS par suffixe stable `[id$="_reference"]` au lieu
de cibler l'ID complet.

---

## Stockage

| Donnée           | Emplacement              | Partagé avec  |
| ---------------- | ------------------------ | ------------- |
| Base SQLite      | `./data/ao_catalog.db`   | API (lecture) |
| ZIPs téléchargés | `./worker/output/`       | worker seul   |
| Fichiers debug   | `./worker/output/debug/` | worker seul   |

En Docker, les chemins sont montés via bind mounts :

- `./data` → `/app/data` (volume partagé avec le service `api`)
- `./worker/output` → `/app/output`

---

## Planification

Le worker démarre un scrape immédiat au lancement, puis répète toutes les
`WORKER_SCHEDULE_HOURS` heures via APScheduler (`BackgroundScheduler`).

- `max_instances=1` : pas d'exécutions concurrentes
- `coalesce=True` : si un job est manqué, n'en exécuter qu'un seul au rattrapage
- Arrêt propre sur `SIGINT` / `SIGTERM` (Docker stop)
