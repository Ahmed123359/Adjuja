# OffrIA — Architecture technique

## Sommaire

1. [Vue d'ensemble](#vue-densemble)
2. [Structure des dossiers](#structure-des-dossiers)
3. [Backend — Patterns d'architecture](#backend--patterns-darchitecture)
4. [Flux de génération — Parse + Phase 1 + Phase 2](#flux-de-génération--parse--phase-1--phase-2)
5. [Flux d'extraction PDF](#flux-dextraction-pdf)
6. [Authentification](#authentification)
7. [Base de données SQLite](#base-de-données-sqlite)
8. [Sécurité](#sécurité)
9. [Configuration (.env)](#configuration-env)
10. [API — Référence des routes](#api--référence-des-routes)
11. [Infrastructure Docker](#infrastructure-docker)
12. [Tests](#tests)

---

## Vue d'ensemble

OffrIA est une application web full-stack permettant de générer des réponses à des appels d'offres via des LLMs. Elle est structurée en deux parties découplées : un backend FastAPI et un frontend React, communiquant via une API REST.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Navigateur                              │
│  React + TypeScript + Tailwind CSS (Vite)                       │
│  LeftPanel │ RightPanel │ Header                                 │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTP / REST (Bearer JWT)
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend FastAPI (Python)                      │
│                                                                  │
│  Routes ──► Services ──► Providers LLM                          │
│                │                                                 │
│             SQLite (users, history, usage)                       │
│             Qdrant optionnel (RAG)                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Structure des dossiers

```
reponse_ao_generation/
│
├── app/                          # Backend Python (FastAPI)
│   ├── main.py                   # Entrée ASGI : app FastAPI, middlewares, routers
│   ├── limiter.py                # Instance SlowAPI (rate limiting)
│   ├── config/
│   │   └── settings.py           # Pydantic-settings — config centralisée via .env
│   ├── models/
│   │   ├── appel_offre.py        # AppelOffre, Section, Critere, TypeMarche
│   │   ├── generation.py         # GenerationRequest, GenerationResult, ModeleDisponible
│   │   ├── history.py            # HistoryEntry, HistorySummary
│   │   └── user.py               # User, UserCreate, UserPublic, Token
│   ├── providers/
│   │   ├── base.py               # AbstractLLMProvider (ABC)
│   │   ├── openai_provider.py    # Implémentation OpenAI
│   │   ├── anthropic_provider.py # Implémentation Anthropic (Claude)
│   │   ├── mistral_provider.py   # Implémentation Mistral
│   │   └── provider_factory.py   # Factory Pattern — instanciation par nom
│   ├── services/
│   │   ├── ao_parser_service.py      # Parse texte brut → AppelOffre structuré
│   │   ├── prompt_builder_service.py # Construit les prompts LLM (brief + sections)
│   │   ├── generation_service.py     # Orchestre la génération en 2 phases
│   │   ├── pdf_extract_service.py    # Extraction texte PDF (pymupdf + GPT-4o OCR)
│   │   ├── history_service.py        # CRUD historique SQLite par user_id
│   │   ├── usage_service.py          # Compteurs tokens/appels (en mémoire + SQLite)
│   │   ├── user_service.py           # CRUD users SQLite (hash bcrypt, JWT)
│   │   └── rag_service.py            # Retrieval-Augmented Generation via Qdrant
│   └── api/
│       ├── dependencies.py           # FastAPI Depends — injection de services
│       └── routes/
│           ├── auth_routes.py        # POST /auth/register, /auth/login, GET /auth/me
│           ├── generation_routes.py  # POST /generate
│           ├── brief_routes.py       # POST /brief (phase 1 seule)
│           ├── pdf_routes.py         # POST /pdf/extract
│           ├── models_routes.py      # GET /models
│           ├── history_routes.py     # CRUD /history
│           ├── usage_routes.py       # GET/POST /usage
│           ├── defaults_routes.py    # GET/POST /defaults
│           └── rag_routes.py         # GET /rag/status, POST /rag/index
│
├── frontend/                     # Frontend TypeScript (React + Vite)
│   └── src/
│       ├── main.tsx              # Entrée React — auth state machine
│       ├── App.tsx               # Root — state global (aoText, provider, company…)
│       ├── api.ts                # Couche fetch vers le backend (auth headers)
│       ├── types.ts              # Interfaces TypeScript du domaine
│       └── components/
│           ├── Header.tsx        # Logo, usage, RAG, thème, user info
│           ├── LeftPanel.tsx     # Formulaire AO + LLM + profil entreprise
│           └── RightPanel.tsx    # Résultat, brief, export Word/PDF
│
├── data/                         # Base de données SQLite (gitignorée)
│   └── offria.db                 # Tables : users, history, usage
│
├── knowledge_base/               # Documents internes pour le RAG (indexés dans Qdrant)
│   ├── references/               # Attestations clients (PDFs)
│   ├── certifications/           # Certifications et qualifications
│   ├── company/                  # Présentation entreprise (MD + PDFs)
│   ├── resources/                # CVs équipe, listes matériels (PDFs)
│   └── templates/                # Notes méthodologiques et logistiques (PDFs)
│
├── rag_service/                  # Microservice ETL — indexation Qdrant
│   ├── etl.py                    # Pipeline : extraction → chunking → embedding → Qdrant
│   └── ROADMAP.md                # Roadmap qualité RAG pipeline
│
├── rd/                           # R&D — notebooks d'expérimentation
│   ├── ocr/
│   │   └── ocr_extraction.ipynb     # Validation approche extraction PDF
│   ├── rag/
│   │   └── rag_evaluation.ipynb     # Évaluation pipeline RAG (retrieval quality)
│   └── analyse_ao/
│       └── ao_char_analysis.ipynb   # Mesure taille réelle des AOs (chars, tokens)
│
├── conception/                   # Documentation produit et technique
│   ├── 1.Roadmap/
│   ├── 2. Architecture/          # Ce dossier
│   ├── 3. Logo/
│   └── 5. Pitch/
│
├── tests/
│   ├── unit/                     # Tests unitaires (parser, factory)
│   └── integration/              # Tests API (TestClient + mocks)
│
├── docker-compose.yml            # Prod/staging
├── docker-compose.dev.yml        # Dev (hot-reload back + front)
└── requirements.txt
```

---

## Backend — Patterns d'architecture

### 1. Layered Architecture

```
Route (HTTP) → Service (logique métier) → Provider / Repository (infra)
```

Les routes ne contiennent pas de logique métier — elles valident, appellent le service, gèrent les codes HTTP.

### 2. Abstract Base Class + Strategy Pattern (Providers LLM)

```python
AbstractLLMProvider   (ABC)
  ├── OpenAIProvider
  ├── AnthropicProvider
  └── MistralProvider
```

Tous les providers exposent la même interface `generate_text(system, user, max_tokens, temperature)`. Ajouter un nouveau provider = créer une sous-classe et l'enregistrer dans `ProviderFactory`.

### 3. Factory Pattern

`ProviderFactory.create(provider_name, api_key, model_name)` retourne l'instance concrète. Le client (service) n'a pas à connaître les sous-classes.

### 4. Dependency Injection (FastAPI Depends)

```python
# dependencies.py
@lru_cache
def get_generation_service() -> GenerationService: ...

# route
async def generate(service = Depends(get_generation_service)): ...
```

Les services sont des singletons via `@lru_cache`. L'injection permet de les remplacer facilement en test (`app.dependency_overrides`).

### 5. Singleton via @lru_cache

`get_settings()`, `get_parser()`, `get_prompt_builder()` sont appelés une seule fois au démarrage. Le fichier `.env` est lu une seule fois.

---

## Flux de génération — Parse + Phase 1 + Phase 2

```
POST /api/v1/generate
        │
        ▼
GenerationService.generate(request)
        │
        ├─ Parse LLM ──► modèle cheap (timeout 30s, max 500 tokens)
        │       ├─ succès → AppelOffre structuré (titre, acheteur, critères, budget…)
        │       └─ échec  → fallback regex silencieux (AOParserService)
        │
        ├─ Phase 1 ──► build_brief_prompt()
        │               │
        │               └─► LLM (1 appel) ──► brief_strategique
        │
        └─ Phase 2 ──► asyncio.gather() — 8 coroutines en parallèle
                        │
                        ├─► _gen_section(section_1)
                        │       ├─► RAG retrieve (optionnel)
                        │       │       ├─► _build_query_for_section() — LLM cheap (1 appel)
                        │       │       │       AO complet + section_title → query 10-20 mots
                        │       │       ├─► Qdrant top-20 (embedding + recherche vectorielle)
                        │       │       └─► _rerank() — LLM cheap (1 appel) → top-K chunks
                        │       └─► LLM (1 appel) — prompt + AO + brief + RAG context
                        ├─► _gen_section(section_2)
                        │   ...
                        └─► _gen_section(section_8)
                        │
                        └─► Assemblage → GenerationResult
```

**Total appels LLM par génération complète :**
- **Sans RAG : 10** (1 parse cheap + 1 brief + 8 sections)
- **Avec RAG : 26** (+ 8 query gen cheap + 8 rerank cheap — tous en parallèle)

| Provider | Modèle utilisé pour le parse |
|---|---|
| Anthropic | `claude-haiku-4-5-20251001` |
| OpenAI | `gpt-4o-mini` |
| Mistral | `mistral-small-latest` |

**POST /api/v1/brief** : 2 appels (1 parse cheap + 1 brief), sans déclencher les sections.

---

## Flux d'extraction PDF

```
POST /api/v1/pdf/extract  (multipart file)
        │
        ▼
PdfExtractService.extract(pdf_bytes)
        │
        ├─ pymupdf → extrait texte embarqué
        │       │
        │       ├─ avg_chars/page ≥ 50 ──► retourne le texte (méthode: pymupdf)
        │       │
        │       └─ avg_chars/page < 50 → PDF scanné détecté
        │               │
        │               └─► render pages en PNG (150 DPI)
        │                       │
        │                       └─► GPT-4o vision → transcription
        │                               │
        │                               └─► retourne le texte (méthode: gpt4o_vision)
```

---

## Authentification

### Flux JWT

```
POST /api/v1/auth/register  →  hash bcrypt  →  INSERT users  →  access_token (JWT HS256)
POST /api/v1/auth/login     →  verify hash  →  access_token (JWT HS256)
GET  /api/v1/auth/me        →  decode Bearer  →  UserPublic
```

### Middleware côté frontend

```typescript
// api.ts
function authHeaders() {
  const token = localStorage.getItem('offria_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}
```

### Isolation des données par utilisateur

L'historique est filtré par `user_id` dans `HistoryService`. Chaque utilisateur ne voit que ses propres générations.

---

## Base de données SQLite

Fichier : `data/offria.db`

```sql
CREATE TABLE users (
    id          TEXT PRIMARY KEY,   -- UUID v4
    nom         TEXT NOT NULL,
    prenom      TEXT NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    hashed_pwd  TEXT NOT NULL,
    created_at  TEXT NOT NULL       -- ISO 8601
);

CREATE TABLE history (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    ao_excerpt      TEXT,
    company_nom     TEXT,
    provider        TEXT,
    model           TEXT,
    tokens_utilises INTEGER,
    langue          TEXT,
    result_json     TEXT            -- GenerationResult sérialisé en JSON
);

CREATE TABLE usage (
    id              INTEGER PRIMARY KEY,
    total_tokens    INTEGER DEFAULT 0,
    total_appels    INTEGER DEFAULT 0
);
```

---

## Sécurité

| Mesure | Implémentation |
|---|---|
| Mots de passe | `bcrypt` via `passlib` |
| Sessions | JWT HS256, expiration 7j, clé ≥ 32 chars |
| CORS | `*` en dev, liste explicite en prod via `ALLOWED_ORIGINS` |
| Rate limiting | `slowapi` sur POST /generate — 10 req/min/user par défaut |
| Inscription restreinte | `ALLOWED_EMAILS` dans `.env` pour whitelist optionnelle |
| Clé JWT par défaut refusée en prod | Validateur Pydantic au démarrage |

---

## Configuration (`.env`)

| Variable | Défaut | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Clé API Claude |
| `OPENAI_API_KEY` | — | Clé API OpenAI (génération + OCR vision) |
| `MISTRAL_API_KEY` | — | Clé API Mistral |
| `JWT_SECRET_KEY` | change-me | Clé de signature JWT (min 32 chars) |
| `JWT_EXPIRE_MINUTES` | 10080 | Durée token (7 jours) |
| `ALLOWED_ORIGINS` | `[]` | Origines CORS en prod |
| `ALLOWED_EMAILS` | `[]` | Whitelist emails inscription |
| `APP_ENV` | development | `development` \| `production` |
| `QDRANT_URL` | — | URL Qdrant (vide = RAG désactivé) |
| `RAG_ETL_URL` | — | URL microservice ETL (proxy /index) |
| `AO_MAX_CHARS` | 100000 | Limite chars texte AO injectés dans le prompt (~25k tokens, couvre 99%+ des AOs) |
| `RATE_LIMIT_GENERATE` | 10/minute | Limite POST /generate par user |
| `LLM_TIMEOUT_SECONDS` | 60 | Timeout par appel LLM |

---

## API — Référence des routes

### Publiques (sans auth)

| Méthode | Route | Description |
|---|---|---|
| GET | `/health` | Santé de l'application (SQLite, clés API, Qdrant) |
| GET | `/api/v1/models` | Tous les modèles disponibles |
| GET | `/api/v1/defaults` | Valeurs par défaut (profil, instructions) |
| POST | `/api/v1/auth/register` | Inscription |
| POST | `/api/v1/auth/login` | Connexion |

### Protégées (Bearer JWT requis)

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/v1/auth/me` | Profil utilisateur courant |
| POST | `/api/v1/generate` | Génération complète (brief + 8 sections) |
| POST | `/api/v1/brief` | Brief stratégique seul (phase 1) |
| POST | `/api/v1/pdf/extract` | Extraction texte PDF (pymupdf ou OCR GPT-4o) |
| GET | `/api/v1/history` | Liste des générations de l'utilisateur |
| GET | `/api/v1/history/{id}` | Détail d'une génération |
| DELETE | `/api/v1/history/{id}` | Supprimer une entrée |
| DELETE | `/api/v1/history` | Vider l'historique |
| GET | `/api/v1/usage` | Compteurs tokens/appels |
| POST | `/api/v1/usage/reset` | Réinitialiser les compteurs |
| GET | `/api/v1/rag/status` | Statut de la base vectorielle |
| POST | `/api/v1/rag/index` | Déclencher la réindexation |

---

## Infrastructure Docker

```yaml
# docker-compose.yml  (prod)
services:
  api:       FastAPI + Uvicorn (port 8000)
  frontend:  Build statique servi via FastAPI StaticFiles (/ui/)
  qdrant:    Base vectorielle (optionnel, RAG)

# docker-compose.dev.yml  (dev, hot-reload)
services:
  api:       --reload  (hot-reload Python)
  frontend:  npm run dev -- --host 0.0.0.0  (HMR Vite, port 5173)
```

Le frontend de développement (port 5173) proxifie `/api` et `/health` vers le backend (port 8000) via `vite.config.ts`.

---

## Tests

```
tests/
├── unit/
│   ├── test_ao_parser.py        # Parse texte brut → AppelOffre
│   └── test_provider_factory.py # Factory — instanciation des providers
└── integration/
    └── test_api.py              # TestClient FastAPI + mocks LLM
```

```bash
pytest                    # tous les tests
pytest tests/unit/        # tests unitaires seuls
pytest --cov=app          # couverture de code
```
