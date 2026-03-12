# Worker — Scraper marchespublics.gov.ma

Worker silencieux qui enrichit la base de données `appels_offre` en scrappant
le portail [marchespublics.gov.ma](https://www.marchespublics.gov.ma) à intervalle régulier.

Il tourne **indépendamment** du service API et de l'interface utilisateur.
Aucun appel entrant, aucun port exposé — il écrit, l'API lit.

---

## Architecture

```
worker/
  config.py      ← Variables d'environnement (pydantic-settings)
  models.py      ← Dataclass AOResult
  db.py          ← Schema SQLite, migration, upsert (zéro scraping)
  scraper.py     ← Logique Playwright (get_ao_links, download_dossier)
  scheduler.py   ← APScheduler — job périodique
  main.py        ← Point d'entrée, arrêt propre SIGTERM/SIGINT
  Dockerfile
  requirements.txt
  README.md
```

**Principe de séparation des responsabilités :**
- `db.py` ne sait pas scraper
- `scraper.py` ne sait pas persister
- `scheduler.py` orchestre les deux
- `config.py` ne contient aucune logique métier

---

## Variables d'environnement

Toutes les variables sont préfixées `WORKER_`.

| Variable | Défaut | Description |
|---|---|---|
| `WORKER_ACHETEUR` | `OFFICE NATIONAL DES CHEMINS DE FER` | Nom exact dans l'autocomplete |
| `WORKER_FAKE_NOM` | `Dupont` | Nom pour le formulaire de retrait |
| `WORKER_FAKE_PRENOM` | `Jean` | Prénom pour le formulaire de retrait |
| `WORKER_FAKE_EMAIL` | `jean.dupont@exemple.ma` | Email pour le formulaire de retrait |
| `WORKER_MAX_AOS` | `20` | Nombre max d'AOs par scrape |
| `WORKER_HEADLESS` | `true` | Mode sans interface (obligatoire en prod) |
| `WORKER_SLOW_MO` | `200` | Délai ms entre actions Playwright |
| `WORKER_SCHEDULE_HOURS` | `6` | Intervalle entre deux scrapes (heures) |
| `WORKER_DB_PATH` | `/app/data/ao_catalog.db` | Chemin de la base SQLite |
| `WORKER_OUTPUT_DIR` | `/app/output` | Dossier de stockage des ZIPs |

Ajouter dans le `.env` à la racine du projet :

```env
# ── Worker scraper ──────────────────────────────────────────
WORKER_ACHETEUR=OFFICE NATIONAL DES CHEMINS DE FER
WORKER_FAKE_NOM=Dupont
WORKER_FAKE_PRENOM=Jean
WORKER_FAKE_EMAIL=jean.dupont@exemple.ma
WORKER_MAX_AOS=20
WORKER_HEADLESS=true
WORKER_SLOW_MO=200
WORKER_SCHEDULE_HOURS=6
```

---

## Démarrage

### Docker (recommandé)

```bash
# Démarrer tous les services (API + worker)
docker compose up

# Worker seul
docker compose up worker

# Logs en temps réel
docker compose logs -f worker

# Forcer un scrape immédiat (redémarre le conteneur → exécution au démarrage)
docker compose restart worker
```

### Local (développement)

```bash
cd worker
pip install -r requirements.txt
playwright install chromium

# Depuis la racine du projet (pour les imports relatifs)
python -m worker.main
```

---

## Base de données

La table `appels_offre` est dans `data/ao_catalog.db` (volume partagé avec l'API).

**Schéma :**

```sql
CREATE TABLE appels_offre (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    ref_consultation TEXT    UNIQUE NOT NULL,  -- ID interne PRADO
    reference        TEXT,                     -- Réf AO (ex: "25S038")
    titre            TEXT,
    objet            TEXT,                     -- Description complète
    acheteur         TEXT,                     -- Filtre de recherche
    acheteur_detail  TEXT,                     -- Acheteur complet (page détail)
    type_annonce     TEXT,                     -- ex: "Annonce de consultation"
    procedure        TEXT,                     -- ex: "Appel d'offres ouvert"
    categorie        TEXT,                     -- ex: "Services"
    contact_nom      TEXT,
    contact_email    TEXT,
    contact_tel      TEXT,
    date_limite      TEXT,                     -- ex: "22/04/2026 09:00"
    url_detail       TEXT,
    zip_path         TEXT,                     -- Chemin local du ZIP
    scraped_at       TEXT    NOT NULL,         -- ISO 8601
    statut           TEXT    NOT NULL DEFAULT 'disponible'
)
```

**Migration automatique :** si la table existe avec un ancien schéma, les colonnes
manquantes sont ajoutées silencieusement au démarrage (`db.py:init_db`).

---

## Sécurité

- Le conteneur tourne sous un utilisateur non-root (`worker`, UID 1000)
- `WORKER_HEADLESS=true` obligatoire en production
- Aucun port exposé (service interne uniquement)
- Les identités du formulaire (`FAKE_*`) doivent être définies dans `.env`
  (jamais commitées)
- Le volume `./data` est partagé en lecture-écriture avec l'API — ne pas
  monter en `:ro` côté worker

---

## Flux interne

```
main.py
  └─ run_scrape_job(settings)          ← immédiat au démarrage + toutes les Xh
       ├─ scraper.run_scrape(settings)  ← cycle Playwright complet
       │    ├─ _get_ao_links()          ← recherche + liste AOs
       │    └─ _download_dossier() ×N  ← fiche + métadonnées + formulaire + ZIP
       └─ db.upsert_ao() ×N            ← persistance SQLite (upsert)
```
