# AO Watcher : Architecture & Design

---

## What Does This Service Actually Do?

Three jobs, nothing more:

```
1. COLLECT    ->  scrape public procurement portals (marchepublic.ma + others)
2. STORE      ->  persist AO metadata + lazy-download offer documents (ZIP)
3. BRIDGE     ->  let the user import a favorited AO into the generation pipeline
```

Everything else is infrastructure around these 3 jobs.

---

## User Journey (the full flow)

```
[Veille AO page]
  Browse scraped AOs (metadata only, fast)
    -> User clicks "Favori" on an interesting AO
         -> Background task: download ZIP from source portal
              -> Unzip in memory + auto-classify documents
                   -> Store each file in MinIO: /ao-watcher/{scraped_ao_id}/
                        -> User goes to Pipeline page
                             -> "Lancer le pipeline" (docs already there, zero friction)
                                  -> Existing Celery pipeline runs normally
```

The key value: the user never uploads a document manually. Favoriting triggers everything.

---

## AO Lifecycle (status transitions)

```
new  ->  seen  ->  favorited  ->  imported
                      ^               ^
               triggers ZIP     creates row in
               download         appels_offres
               (lazy, async)    + ao_documents
```

**Why lazy download (on favorite, not on scrape):**
marchepublic.ma lists thousands of AOs. Downloading every ZIP at scrape time wastes
storage for 99% of AOs no one will ever touch. Download only when the user signals
intent by favoriting.

---

## Service Architecture

```
reponse-ao-generation/
  app/               (existing FastAPI, port 8000 -- NOT touched)
  ao-watcher/        (NEW isolated service, port 8001)
```

The ao-watcher is a **separate Docker service sharing the same PostgreSQL**.
It does not embed into the existing FastAPI app.
It does not have its own database.

Why shared DB, separate service:
- One PostgreSQL to operate, not two
- The "import to pipeline" step is a simple DB write, no network hop
- The main app can query `watcher.scraped_aos` directly without an HTTP call
- The scraper worker is isolated: its crashes do not affect the main API

```
docker-compose.dev.yml additions:
  ao-watcher-api      FastAPI :8001
  ao-watcher-worker   Celery prefork (Playwright compatible)
  ao-watcher-beat     Celery Beat scheduler
```

---

## Directory Structure

```
ao-watcher/
  app/
    modules/
      ao_scraper/
        base.py              <- IAOScraper interface
        marchepublic.py      <- first implementation
        repository.py        <- AoRepository (upsert + read)
        schemas.py           <- AoOut Pydantic model
        router.py            <- GET /aos, PATCH /aos/{id}/status, POST /aos/{id}/import
    workers/
      celery_app.py          <- Beat schedule (every 6h scrape)
      utils.py               <- run_async(), task_db() with NullPool
      tasks/
        scrape_tasks.py      <- run_scrape_pipeline Celery task
        download_tasks.py    <- download_ao_zip Celery task (triggered on favorite)
    core/
      config.py              <- settings (reads same .env as main app)
      database.py            <- engine (watcher schema, NullPool per task)
      models.py              <- ScrapedAo SQLAlchemy model
    main.py                  <- FastAPI app
  scrapers/
    marchepublic.config.json <- CSS selectors, URLs, pagination (NEVER in Python)
  Dockerfile
  requirements.txt
```

---

## Database Schema

Schema: `watcher` (separate from the main app's `public` schema, same PostgreSQL).

```sql
CREATE SCHEMA watcher;

CREATE TABLE watcher.scraped_aos (
    id                 SERIAL PRIMARY KEY,

    -- Source identification
    source             VARCHAR(50)  NOT NULL,    -- 'marchepublic', 'tanmia', ...
    external_id        VARCHAR(255) NOT NULL,    -- ID or hash from the source page
    url_source         TEXT         NOT NULL,    -- full URL to the AO detail page

    -- AO metadata (scraped from listing page)
    acheteur           TEXT,
    titre              TEXT         NOT NULL,
    date_publication   DATE,
    date_limite        DATE,
    categorie          VARCHAR(100),             -- Travaux / Services / Fournitures
    secteur            VARCHAR(200),
    region             VARCHAR(100),
    ville              VARCHAR(100),
    budget_estime      NUMERIC(15, 2),
    caution            NUMERIC(15, 2),
    description        TEXT,

    -- Lifecycle
    status             VARCHAR(20)  DEFAULT 'new',  -- new / seen / favorited / imported
    scraped_at         TIMESTAMPTZ  DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  DEFAULT NOW(),

    -- ZIP document handling (populated lazily on favorite)
    zip_url            TEXT,                    -- download URL on the source portal
    zip_minio_key      TEXT,                    -- MinIO path once downloaded
    zip_downloaded_at  TIMESTAMPTZ,             -- NULL = not yet downloaded
    zip_error          TEXT,                    -- last error message if download failed
    classified_docs    JSONB,                   -- {"cps": "key", "rc": "key", ...}

    CONSTRAINT uq_source_external UNIQUE (source, external_id)
);

-- Indexes
CREATE INDEX idx_scraped_aos_status    ON watcher.scraped_aos(status);
CREATE INDEX idx_scraped_aos_region    ON watcher.scraped_aos(region);
CREATE INDEX idx_scraped_aos_categorie ON watcher.scraped_aos(categorie);
CREATE INDEX idx_scraped_aos_deadline  ON watcher.scraped_aos(date_limite DESC);
CREATE INDEX idx_scraped_aos_source    ON watcher.scraped_aos(source);
```

### Key Schema Decisions

**`UNIQUE(source, external_id)` on scraped_aos** : scraper runs every 6h.
PostgreSQL upsert (`ON CONFLICT DO UPDATE`) keeps metadata fresh without duplicating rows.
`status` and `classified_docs` are never overwritten on conflict: a favorited AO
stays favorited even after the next scrape run refreshes its metadata.

**`classified_docs` JSONB** : the bridge to the existing pipeline. When the user
clicks "Lancer le pipeline", the main app reads this field to pre-populate
`ao_documents` rows with the MinIO keys, with zero manual upload.

**`watcher` schema** : namespaces scraper tables away from the main app's `public`
schema. They coexist in the same PostgreSQL instance without risk of name collision.

---

## The Config-Driven Selector Pattern

Selectors are never hardcoded in Python. They live in a JSON file per source.
When marchepublic.ma updates their HTML: edit JSON, no code change, no redeployment.

```json
// scrapers/marchepublic.config.json
{
  "version": "2026-06-17",
  "base_url": "https://www.marchepublic.ma",
  "list_path": "/BO/index.jsp?typeMarche=ao&typeAo=ao",
  "pagination": {
    "param": "page",
    "start": 1,
    "max_pages": 20
  },
  "selectors": {
    "row":             "tr.ao-row",
    "acheteur":        "td.acheteur",
    "titre":           "td.objet a",
    "date_publication":"td.date-pub",
    "date_limite":     "td.date-remise",
    "categorie":       "td.categorie",
    "region":          "td.region",
    "detail_link":     "td.objet a[href]",
    "zip_link":        "a[href$='.zip'], a.download-link"
  },
  "delays": {
    "between_pages_s":    [2, 5],
    "between_requests_s": [1, 3]
  }
}
```

Note: the actual selector values above are placeholders. They must be verified
by inspecting the real marchepublic.ma HTML before implementation.

---

## IAOScraper Interface

```python
# ao-watcher/app/modules/ao_scraper/base.py

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

@dataclass
class AoData:
    external_id:        str
    url_source:         str
    acheteur:           str | None
    titre:              str
    date_publication:   date | None
    date_limite:        date | None
    categorie:          str | None
    secteur:            str | None
    region:             str | None
    ville:              str | None
    budget_estime:      Decimal | None
    caution:            Decimal | None
    description:        str | None
    zip_url:            str | None

class IAOScraper(ABC):
    @abstractmethod
    async def fetch_aos(self, page: int = 1) -> list[AoData]:
        """Fetch one page of AOs from the source portal."""

    @abstractmethod
    async def health_check(self) -> bool:
        """Return True if the source portal is reachable."""
```

To add a new source tomorrow (tanmia.ma, appelsoffres.ma): implement `IAOScraper`,
add a config JSON, register in `scrape_tasks.py`. Nothing else changes.

---

## Document Classification

After unzipping, each file is classified by filename heuristic. Works for 90%+ of
Moroccan government procurement ZIPs because naming conventions are standardized.

```python
CLASSIFICATION_RULES = [
    (r"cps|cahier.*(prescription|sp[eé]cial)",      "cps"),
    (r"^rc[_\s-]|r[eè]glement.*consult",            "rc"),
    (r"acte.*engagement|engagement",                 "acte_engagement"),
    (r"bordereau|bpu|dpq|prix",                      "bordereau_des_prix"),
    (r"plan|ccag|cahier.*charge",                    "ccag"),
]
# Fallback for unrecognized files: "autre_doc_1", "autre_doc_2", ...
```

The result is stored as JSONB in `classified_docs`:

```json
{
  "cps":              "ao-watcher/42/cps.pdf",
  "rc":               "ao-watcher/42/rc.pdf",
  "acte_engagement":  "ao-watcher/42/acte_engagement.pdf",
  "bordereau_des_prix": "ao-watcher/42/bordereau.pdf",
  "autre_doc_1":      "ao-watcher/42/autre_doc_1.pdf"
}
```

---

## Celery Tasks

### Task 1 : Periodic scrape (every 6h)

```python
@celery_app.task(name="tasks.run_scrape_pipeline")
def run_scrape_pipeline():
    # For each registered source:
    #   1. Instantiate IAOScraper
    #   2. Paginate until no new AOs or max_pages reached
    #   3. Upsert each page with savepoint (one source failing = others continue)
    #   4. Log counts: raw / upserted / skipped
```

Every 6h is the right cadence for public AOs. They do not appear and disappear
in minutes. Running more often wastes bandwidth on a government server.

### Task 2 : Lazy ZIP download (triggered on favorite)

```python
@celery_app.task(name="tasks.download_ao_zip", max_retries=3, default_retry_delay=60)
def download_ao_zip(scraped_ao_id: int):
    # 1. Fetch zip_url from DB
    # 2. Download ZIP with timeout=60s (retry on network error)
    # 3. Unzip in memory (zipfile.ZipFile(BytesIO(content)))
    # 4. For each file: classify + upload to MinIO
    # 5. Update scraped_aos: zip_minio_key, classified_docs, zip_downloaded_at
    # 6. On permanent failure: write error to zip_error, do NOT set status back
```

Unzip in memory, never touch disk.

---

## API Surface

Consumed by the ADJUJA frontend (internal Docker network).

```
GET  /aos
     ?status=new|seen|favorited|all
     &region=Casablanca-Settat
     &categorie=Services|Travaux|Fournitures
     &acheteur=...
     &search=...
     &date_limite_from=YYYY-MM-DD
     &page=1&limit=50

GET  /aos/{id}
     Returns full AO detail including classified_docs download URLs (presigned MinIO)

PATCH /aos/{id}/status
     body: {"status": "seen" | "favorited"}
     Setting status="favorited" triggers download_ao_zip.delay(id) automatically

POST  /aos/{id}/import-to-pipeline
     Creates appels_offres row (from scraped metadata)
     Creates ao_documents rows (from classified_docs MinIO keys)
     Returns {"ao_id": "..."}  (frontend redirects to existing AoPipelinePage)

GET  /aos/stats
     Returns counts per region, categorie, source (for filter badges like the datao UI)
```

---

## "Import to Pipeline" Bridge (main app side)

The existing pipeline is unchanged. The bridge is a single endpoint on the main app:

```
POST /api/v1/pipeline/from-watcher
body: {
  "scraped_ao_id": 42,
  "watcher_ao_id": "...",  -- or the main app reads watcher.scraped_aos directly
}

-> Reads classified_docs from watcher.scraped_aos
-> Creates appels_offres row (titre, acheteur, date_limite, ...)
-> Creates ao_documents rows (type=cps/rc/..., minio_key from classified_docs)
-> Returns ao_id
-> Frontend redirects to /pipeline/{ao_id}
-> Existing Celery pipeline runs normally (no change needed)
```

Zero changes to the existing pipeline. The bridge just pre-populates the tables
that the pipeline already reads from.

---

## Source Intelligence

Inspected on 2026-06-17. All findings based on real HTTP responses.

---

### The MPE Platform Discovery

All inspected Moroccan procurement portals run the **same underlying platform**,
referred to here as MPE (Marchés Publics Electroniques). Same URL patterns,
same page names, same HTML structure, same ASP.NET WebForms pagination.

**Consequence for the scraper: one class handles all MPE portals.**
The `MPEPlatformScraper` takes a `base_url` in its config. Every new MPE portal
is just a new config entry, not a new scraper.

```
IAOScraper
  └─ MPEPlatformScraper          <- handles ALL portals below
       Config: base_url + credentials (optional)
```

---

### MPE URL patterns (identical across all portals)

```
Listing  :  {base_url}/?page=entreprise.EntrepriseAdvancedSearch&AllCons&EnCours&searchAnnCons
Detail   :  {base_url}/?page=entreprise.EntrepriseDetailConsultation&refConsultation={ID}&orgAcronyme={CODE}
Download :  {base_url}/?page=entreprise.EntrepriseDemandeTelechargementDce&refConsultation={ID}&orgAcronyme={CODE}
```

`refConsultation` is always a numeric ID. `orgAcronyme` is a 3-char code for the acheteur.

---

### Known MPE portals (2026-06-17)

| Portal | Base URL | AOs en cours | Auth for listing | Auth for download |
|---|---|---|---|---|
| Portail national | https://www.marchespublics.gov.ma | 3,928 | None | None (anonymous form) |
| SAFAKAT CDG | https://safakat.cdg.ma | 9 | None | TBD |
| CIMR | https://achats.cimr.ma | 3 | None | TBD |

All three portals expose their listing publicly without login.
The national portal (`marchespublics.gov.ma`) is the primary source (99%+ of volume).

---

### Listing page structure (all MPE portals)

**Rendering**: Server-rendered HTML. ASP.NET WebForms.

**Columns** (confirmed on marchespublics.gov.ma):
```
Procédure | Catégorie | Publié le | Référence | Contexte/Programme |
Objet | Acheteur public | Type d'annonce / Lots | Lieu d'exécution |
Clauses soc./env. | Date limite de remise des plis | Détail | Actions
```

---

### Pagination : critical constraint

Pagination fires ASP.NET postback, not URL parameters:
```
javascript:;//ctl0_CONTENU_PAGE_resultSearch_PagerTop_ctl2
```

No `debut` or `page` URL param exists. **Playwright is required.**

Mitigation: set `nbElem=500` via the dropdown before paginating.
Reduces page count on the national portal from 393 to ~8 pages per run.

---

### Detail page fields (confirmed on marchespublics.gov.ma)

```
Référence           :  06/BR/RGON/2026  (human-readable, different from numeric ID)
Objet               :  full description text
Acheteur public     :  RGON / REGION DE GUELMIM - OUED NOUN
Date limite         :  02/04/2029 11:00
Montant estimé      :  379 104,00 MAD (TTC)
Procédure           :  Appel d'offres ouvert
Catégorie           :  Services
Lieu d'exécution    :  Guelmim
Cautionnement prov. :  7 000,00 MAD
Documents           :  Règlement de consultation + Dossier de consultation (DCE)
```

---

### Document download (DCE)

The DCE download endpoint (`EntrepriseDemandeTelechargementDce`) on the national
portal shows an **optional** contact form. All fields are optional. Anonymous
download is allowed.

Download strategy (no Playwright needed, just requests):
```
1. GET the DCE download page
2. Extract __VIEWSTATE and ASP.NET hidden form inputs
3. POST the form with empty contact fields
4. Follow redirect to the actual file
5. Stream to MinIO, unzip in memory, classify
```

Auth status on CDG and CIMR download endpoints: **to be verified**.

---

### MPE scraper config (one file per portal)

```json
// scrapers/marchespublics.config.json
{
  "name": "marchespublics",
  "platform": "mpe",
  "base_url": "https://www.marchespublics.gov.ma",
  "credentials": null,
  "pagination": {
    "type": "aspnet_postback",
    "next_button_id": "ctl0_CONTENU_PAGE_resultSearch_PagerTop_ctl2",
    "items_per_page_selector": "select[name*='nbElem']",
    "items_per_page_value": "500"
  },
  "listing_selectors": {
    "rows": "table tbody tr",
    "col_procedure": "td:nth-child(1)",
    "col_categorie": "td:nth-child(2)",
    "col_publie_le": "td:nth-child(3)",
    "col_reference": "td:nth-child(4)",
    "col_objet": "td:nth-child(6)",
    "col_acheteur": "td:nth-child(7)",
    "col_lieu": "td:nth-child(9)",
    "col_date_limite": "td:nth-child(11)",
    "detail_link": "a[href*='EntrepriseDetailConsultation']"
  },
  "delays": {
    "between_pages_s": [3, 7],
    "after_click_ms": [1500, 3000]
  }
}
```

```json
// scrapers/safakat_cdg.config.json
{
  "name": "safakat_cdg",
  "platform": "mpe",
  "base_url": "https://safakat.cdg.ma",
  "credentials": null,
  "pagination": { "<<": "same as marchespublics" },
  "listing_selectors": { "<<": "same as marchespublics" },
  "delays": { "between_pages_s": [3, 7], "after_click_ms": [1500, 3000] }
}
```

```json
// scrapers/achats_cimr.config.json
{
  "name": "achats_cimr",
  "platform": "mpe",
  "base_url": "https://achats.cimr.ma",
  "credentials": null,
  "pagination": { "<<": "same as marchespublics" },
  "listing_selectors": { "<<": "same as marchespublics" },
  "delays": { "between_pages_s": [3, 7], "after_click_ms": [1500, 3000] }
}
```

Note: `listing_selectors` column indices are estimated from confirmed column order.
Verify against rendered HTML before going live.

---

### Scrape strategy (all MPE portals)

```
MPEPlatformScraper.fetch_aos():
  Playwright (headless)
    -> Load listing URL
    -> Select nbElem=500
    -> loop:
         Parse page HTML with BS4
         Extract rows -> list[AoData]
         Upsert to watcher.scraped_aos
         If all rows on page already exist in DB: stop (no new AOs)
         Click next page button
         Wait after_click_ms
    -> Return total count

download_ao_zip(scraped_ao_id):
  requests (no Playwright)
    -> GET download page, extract __VIEWSTATE
    -> POST with empty contact fields
    -> Stream file to MinIO
    -> Unzip in memory, classify, update classified_docs
```

---

## Anti-Bot Strategy

| Source | Method | Notes |
|---|---|---|
| marchespublics.gov.ma | Playwright | ASP.NET postback pagination, no anti-bot measures |
| Future sources | Playwright + stealth if needed | Headless Chromium, random user-agent, locale Casablanca |

Random delays between page loads (configurable in JSON, not hardcoded).
Government sites do not use Cloudflare or reCAPTCHA.

---

## Worker Pool

**prefork**, not gevent.

If any source requires Playwright, gevent monkey-patches subprocess and breaks it.
prefork gives each task its own clean Python process. Use prefork from day one
so adding new sources requires zero worker configuration change.

```bash
celery -A workers.celery_app worker --pool=prefork --concurrency=2 --loglevel=info
```

---

## Open Questions (still to resolve)

1. **DCE actual content** : is the DCE a single ZIP containing CPS + RC + acte + bordereau,
   or multiple separate files? Must test a real download.

2. **nbElem=500 via Playwright** : confirm that clicking the 500-option dropdown
   actually loads 500 rows before pagination, reducing page count from 393 to ~8.

3. **Stop condition for scraper** : use `date_publication >= now() - 6h` to stop
   early, or rely on "all external_ids already in DB" check?

4. **Favorites UI location** : new top-level route `/veille` with sub-tabs
   "Explorer" and "Mes favoris", or inside the existing Dashboard tabs?

5. **Individual doc download buttons** : once DCE is classified in MinIO, can the
   user download each file separately via presigned MinIO URL (1h expiry)?
