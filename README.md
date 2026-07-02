# ADJUJA  Plateforme IA pour les Marchés Publics Marocains

ADJUJA est un SaaS B2B qui automatise la réponse aux appels d'offres publics marocains.
L'utilisateur dépose son dossier de consultation (CPS, RC, templates) et obtient en moins de 2 minutes
une réponse complète, signée et prête à soumettre.

---

## Fonctionnalités principales

| Module | Description |
|---|---|
| **Pipeline AO** | Classifie les documents, génère la note méthodologique (RAG + LLM), remplit automatiquement tous les templates, appose signatures et cachet, produit un ZIP final |
| **Veille AO** | Scrape `marchespublics.gov.ma` toutes les 6h (Playwright + ASP.NET postback), stocke les métadonnées, télécharge le DCE à la demande (favori) |
| **Veille BDC** | Module parallèle pour les bordereaux de commande, classification automatique par nature de prestation |
| **Notification** | Envoi quotidien (08h00) d'un digest des nouveaux AOs correspondant aux secteurs de chaque organisation + newsletter abonnés |
| **Remplissage automatique** | Filler IA sur tous les documents uploadés : détection hybride (mots-clés + LLM), gestion des PDFs scannés (Pixtral vision) |
| **Profil entreprise** | Données légales (ICE, RC, capital), signature, cachet, logo, CVs de l'équipe, instructions personnalisées injectées dans chaque pipeline |

---

## Architecture générale

```
┌─────────────────────────────────────────────────┐
│              NAVIGATEUR (React + Vite)          │
│  Landing  /  Dashboard  /  Veille  /  Pipeline  │
└─────────────────┬───────────────────────────────┘
                  │ HTTPS / REST
                  ▼
┌─────────────────────────────────────────────────┐
│                   NGINX                         │
│   /api/*  →  api:8000                           │
│   /watcher/* → ao-watcher-api:8001              │
└──────┬──────────────────┬───────────────────────┘
       │                  │
       ▼                  ▼
┌──────────────┐  ┌────────────────────┐
│  FastAPI API │  │  AO Watcher API    │
│   port 8000  │  │     port 8001      │
│              │  │                    │
│  Auth JWT    │  │  GET /aos          │
│  Pipeline AO │  │  PATCH status      │
│  Filler      │  │  POST import       │
│  Signing     │  └─────────┬──────────┘
│  Company     │            │ tasks
│  Newsletter  │    ┌───────▼──────────┐
└──────┬───────┘    │  ao-watcher      │
       │ tasks      │  worker + beat   │
       ▼            │  (prefork,       │
┌─────────────────────  Playwright)    │
│   Celery Workers │  └────────────────┘
│                  │
│  celery-io (×4)  │  ┌────────────────────┐
│  LLM, analyse    │  │ Notification API   │
│                  │  │    port 8002       │
│  celery-cpu (×2) │  │                    │
│  filler, signing │  │  PUT preferences   │
│  ZIP, indexation │  │  POST trigger      │
└──────────────────┘  └─────────┬──────────┘
                                │ tasks
                       ┌────────▼──────────┐
                       │  notification     │
                       │  worker + beat    │
                       │  (gevent ×10)     │
                       └───────────────────┘

Infrastructure partagée :
  PostgreSQL  (schemas: public / watcher / notifications)
  Redis       (db 0-4 : cache + brokers Celery)
  MinIO       (objets : profils, CVs, documents AO)
  Qdrant      (RAG : kb_global + kb_{org_id} par organisation)
```

---

## Stack technique

| Couche | Technologie |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy async, Pydantic v2 |
| Workers | Celery 5 (prefork pour ao-watcher, gevent pour notifications) |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS, i18next |
| Base de données | PostgreSQL 15 (3 schemas dans la même instance) |
| Stockage objets | MinIO S3-compatible |
| Recherche vectorielle | Qdrant (RAG par organisation) |
| Cache / Broker | Redis 7 (5 databases logiques) |
| Scraping | Playwright (headless Chromium), BeautifulSoup4 |
| Email | Resend API |
| LLMs supportés | Anthropic Claude, OpenAI GPT, Mistral |
| Infrastructure | Docker Compose (11 services) |

---

## Structure du projet

```
adjuja/
  app/                        # API principale FastAPI (port 8000)
    api/routes/               # Routes : auth, pipeline, filler, signing, newsletter, …
    services/
      filler/                 # Pipeline de remplissage automatique (orchestrateur, segmenteur, LLM)
      offre_technique/        # Générateur de note méthodologique (RAG obligatoire)
      signing_service.py      # Apposition signature + cachet sur PDF
    db/models.py              # Modèles SQLAlchemy (users, company_profiles, ao_documents, …)
    celery_app.py             # Workers Celery IO et CPU

  ao-watcher/                 # Microservice scraping (port 8001)
    app/modules/ao_scraper/   # Scraper MPE (marchespublics.gov.ma, safakat CDG, achats CIMR)
    app/modules/bdc_scraper/  # Scraper BDC (bordereaux de commande)
    app/workers/tasks/        # Tâches : scrape toutes les 6h, download ZIP sur favori
    scrapers/*.config.json    # Sélecteurs CSS par portail (jamais dans le code Python)

  notification-service/       # Microservice notifications (port 8002)
    app/channels/             # Factory + Adapter : ResendEmailChannel (extensible WhatsApp, SMS)
    app/templates/            # Registry : AoDigestTemplate (extensible BdcDigestTemplate)
    app/workers/tasks/        # run_notification_batch, notify_org, notify_newsletter_subscribers

  frontend/                   # SPA React
    src/components/landing/   # Landing page (LandingNav, HeroSection, FeaturesSection, LandingFooter)
    src/components/veille/    # Veille AO + BDC (filtres, détail, SecteurPicker)
    src/pages/                # Dashboard, AoPipelinePage, VeillePage, BdcPage, SettingsPage
    src/api.ts                # Tous les appels HTTP (authHeaders obligatoire)
    src/types.ts              # Types TypeScript centralisés
    nginx.conf                # Reverse proxy interne (React + /api/* + /watcher/*)

  rag_service/                # Microservice ETL Qdrant (indexation knowledge_base)
  conception/                 # Roadmap, architecture, documents de conception
  tests/                      # Tests unitaires et d'intégration (pytest)
```

---

## Flux pipeline principal

```
1. Authentification
   POST /auth/login → JWT HS256 (7 jours)

2. Création de l'AO
   POST /api/v1/ao
   → INSERT appels_offres (statut: "brouillon")

3. Upload multi-fichiers
   POST /api/v1/ao/{id}/upload-multiple
   → MinIO ao/{ao_id}/source/
   → INSERT ao_documents

4. Lancement du pipeline
   POST /api/v1/ao/{id}/start-pipeline
   → Celery chain → chord → callback

5. Pipeline Celery (arrière-plan)

   chain(
     task_classify_uploads,      ←  mots-clés + LLM si ambigu
     task_analyze_ao_context,    ←  LLM lit CPS + RC ensemble → analyse_json
     task_build_pipeline,        ←  dispatch dynamique
   )
   chord(
     group(
       task_generate_note_metho, ←  note métho (RAG kb_global + kb_{org_id})
       task_fill_documents,      ←  filler sur TOUS les uploads
     ),
     task_sign_and_compile       ←  signing + ZIP final
   )
   → task_index_results          ←  enrichissement kb_{org_id}

6. Résultats
   GET /api/v1/ao/{id}
   → Presigned URLs MinIO (15 min)
   → Bouton ZIP global
```

---

## Schéma de base de données (simplifié)

Trois schemas dans le même PostgreSQL :

**Schema `public` (API principale)**
```
users              id, email, hashed_pwd, org_id
company_profiles   org_id, ice, rc, signature_key, cachet_key, custom_instructions
staff_cvs          id, org_id, nom_prenom, poste, cv_key
appels_offres      id, org_id, statut, pipeline_pct, analyse_json, custom_instructions
ao_documents       id, ao_id, dossier, doc_type, origine, minio_key
newsletter_subscribers  id, email, active
```

**Schema `watcher` (ao-watcher)**
```
scraped_aos        id, source, external_id, titre, acheteur, secteur_codes (JSONB+GIN),
                   status (new/seen/favorited/imported), classified_docs (JSONB),
                   zip_minio_key
scraped_bdcs       id, source, reference, objet, nature_prestation, minio_key
```

**Schema `notifications` (notification-service)**
```
notification_preferences   org_id, enabled, secteur_codes (JSONB)
notification_log           org_id, ao_id, batch_id   (UNIQUE → déduplication)
notification_batches       id, started_at, finished_at, emails_sent, status
```

---

## Patterns architecturaux

### Factory + Adapter (channels de notification)

```python
# Ajouter WhatsApp : 1 fichier + 1 décorateur, zéro changement ailleurs
@NotificationChannelFactory.register("whatsapp")
class WhatsAppChannel(NotificationChannel):
    def send(self, recipient, content) -> bool: ...
```

### Config-driven scraping (sélecteurs en JSON)

```json
// scrapers/marchespublics.config.json
// Mise à jour HTML → éditer JSON, pas de redéploiement
{
  "platform": "mpe",
  "base_url": "https://www.marchespublics.gov.ma",
  "pagination": { "type": "aspnet_postback", ... },
  "listing_selectors": { "rows": "table tbody tr", ... }
}
```

### Différenciation par organisation (3 couches)

```
Couche 1  kb_{org_id} (Qdrant, auto-enrichi après chaque pipeline)
Couche 2  company_profiles.custom_instructions (style global, injecté toujours)
Couche 3  appels_offres.custom_instructions (spécifique à un AO, prioritaire)
```

---

## Lancement

### Développement (hot-reload)

```bash
docker compose -f docker-compose.dev.yml up
```

Frontend : http://localhost:5173
API : http://localhost:8000
AO Watcher : http://localhost:8001
Notification : http://localhost:8002

### Production

```bash
# Copier et remplir les variables d'environnement
cp .env.example .env

docker compose up -d

# Vérifier l'état
docker compose ps
curl http://localhost:8000/health
```

### Sans Docker

```bash
# Backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload      # port 8000

# Frontend
cd frontend && npm install && npm run dev   # port 5173
```

---

## Configuration (.env)

```dotenv
# Base de données
POSTGRES_PASSWORD=<hex_password>
DATABASE_URL=postgresql+asyncpg://offria:<POSTGRES_PASSWORD>@postgres:5432/offria

# Stockage
MINIO_ROOT_USER=adjuja
MINIO_ROOT_PASSWORD=<password>

# LLM (au moins une clé requise)
MISTRAL_API_KEY=...
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Auth
JWT_SECRET_KEY=<32+ caractères>

# Email
RESEND_API_KEY=re_...
NOTIFICATION_FROM_EMAIL=noreply@adjuja.com

# Notification service
ADMIN_SECRET=<secret>
```

> Les mots de passe PostgreSQL doivent être des chaînes hexadécimales (les caractères `/` et `+`
> de base64 cassent le parsing de l'URL de connexion).

---

## Tests

```bash
pytest                    # tous les tests
pytest tests/unit/        # unitaires uniquement (sans Docker ni clé API)
pytest --cov=app          # avec couverture
```

---

## Conventions de développement

**Backend (Python)**
- Type hints obligatoires sur toutes les fonctions
- Les routes FastAPI ne contiennent pas de logique métier : validation + appel service + HTTP
- Toute route protégée doit avoir `Depends(get_current_user)`
- Nouveaux services → singleton via `@lru_cache` dans `dependencies.py`
- Ne jamais modifier le schema PostgreSQL sans migration planifiée

**Frontend (TypeScript/React)**
- Tous les appels API passent par `frontend/src/api.ts` avec `authHeaders()`
- Jamais d'appel backend direct depuis un composant
- Types dans `frontend/src/types.ts`
- Couleurs via CSS variables (`--l-blue`, `--l-teal`, etc.), jamais hardcodées
- Textes via `i18next` (`t("clé")`), jamais hardcodés dans les composants

---

## Services Docker

| Service | Port | Description |
|---|---|---|
| `api` | 8000 | FastAPI backend principal |
| `celery-io` |  | Worker Celery : LLM, analyse (concurrency=4) |
| `celery-cpu` |  | Worker Celery : filler, signing, ZIP (concurrency=2) |
| `ao-watcher-api` | 8001 | API scraping AO |
| `ao-watcher-worker` |  | Celery prefork (Playwright, concurrency=2) |
| `ao-watcher-beat` |  | Celery Beat : scrape toutes les 6h |
| `notification-api` | 8002 | API préférences + admin |
| `notification-worker` |  | Celery gevent : envois email (concurrency=10) |
| `notification-beat` |  | Celery Beat : digest quotidien 08h00 |
| `frontend` | 8090 | Nginx + React SPA (production) |
| `postgres` | 5432 | PostgreSQL 15 |
| `redis` | 6379 | Cache + broker Celery (5 DBs logiques) |
| `minio` | 9010/9011 | Stockage objets S3-compatible |
| `qdrant` | 6333/6334 | Base vectorielle (RAG) |

---

## Documentation technique

Les architectures détaillées de chaque module sont dans `conception/` :

- [conception/2. Architecture/architecture.md](conception/2.%20Architecture/architecture.md)  Architecture principale
- [hafid-taches-docs/technical-offer/architecture.md](hafid-taches-docs/technical-offer/architecture.md)  Pipeline AO et filler
- [hafid-taches-docs/scraping/architecture.md](hafid-taches-docs/scraping/architecture.md)  AO Watcher et scraping
- [hafid-taches-docs/notification/architecture.md](hafid-taches-docs/notification/architecture.md)  Service de notification

---

Made by [Continuum](https://continuum.ma)
