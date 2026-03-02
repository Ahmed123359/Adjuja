# OffrIA — Générateur de Réponses aux Appels d'Offres

Plateforme IA qui génère automatiquement des réponses aux appels d'offres marocains et internationaux,
en utilisant des modèles de langage (LLM) de votre choix : **Anthropic Claude**, **OpenAI GPT** ou **Mistral AI**.

> Conçu pour les marchés publics marocains (portailmp.gov.ma) ainsi que les appels d'offres privés
> du secteur marocain (ONEE, OCP, RAM, CDG, communes, ministères…).
> Compatible également avec les appels d'offres en France, en Belgique et dans l'espace francophone.

---

## Sommaire

- [Accès rapide](#accès-rapide)
- [Contexte marocain](#contexte-marocain)
- [Fonctionnement général](#fonctionnement-général)
- [Cycle de vie d'une requête](#cycle-de-vie-dune-requête)
- [Architecture du projet](#architecture-du-projet)
- [Design patterns et principes POO](#design-patterns-et-principes-poo)
- [Installation](#installation)
- [Configuration](#configuration)
- [Base de connaissances (RAG)](#base-de-connaissances-rag)
- [Lancement](#lancement)
- [Interface web](#interface-web)
- [API Reference](#api-reference)
- [Choisir son modèle LLM](#choisir-son-modèle-llm)
- [Ajouter un nouveau provider](#ajouter-un-nouveau-provider)
- [Tests](#tests)
- [Docker](#docker)

---

## Accès rapide

Une fois l'application démarrée (`docker compose up` ou `uvicorn`), ces URLs sont disponibles :

| Interface | URL | Description |
|-----------|-----|-------------|
| **Interface web** | [http://localhost:8000/ui/](http://localhost:8000/ui/) | Interface graphique React pour générer vos réponses AO |
| **Swagger UI** | [http://localhost:8000/docs](http://localhost:8000/docs) | Documentation interactive — tester les endpoints directement |
| **ReDoc** | [http://localhost:8000/redoc](http://localhost:8000/redoc) | Documentation lisible, idéale pour explorer les schémas |
| **Healthcheck** | [http://localhost:8000/health](http://localhost:8000/health) | Vérifie que l'API est bien démarrée |
| **Liste des modèles** | [http://localhost:8000/api/v1/models](http://localhost:8000/api/v1/models) | Tous les modèles LLM disponibles en JSON |
| **Statut RAG** | [http://localhost:8000/api/v1/rag/status](http://localhost:8000/api/v1/rag/status) | Stats Qdrant + disponibilité du service ETL |
| **ETL direct** | [http://localhost:8001/](http://localhost:8001/) | API du microservice rag-etl (si démarré) |

> **Point de départ recommandé :** ouvrez [http://localhost:8000/ui/](http://localhost:8000/ui/)
> pour accéder à l'interface graphique. Elle permet de déposer votre AO, choisir le modèle
> et générer la réponse sans aucune ligne de commande.

---

## Contexte marocain

### Cadre réglementaire

Le Maroc dispose d'une réglementation structurée des marchés publics :

- **Décret n° 2-22-431** du 8 mars 2023 relatif aux marchés publics — texte de référence
- **Portail des marchés publics** : [portailmp.gov.ma](https://www.portailmp.gov.ma) — publication officielle des AO
- **Commission nationale de la commande publique (CNCP)** — organe de régulation

### Acteurs typiques émetteurs d'AO au Maroc

| Secteur | Exemples d'organismes |
|---------|----------------------|
| Énergie & eau | ONEE, MASEN, ONHYM |
| Industrie & mines | OCP, Reminex |
| Transport & logistique | RAM, ONCF, ANP, TMSA |
| Finance & investissement | CDG, CIH, MAMDA |
| Télécoms | Maroc Telecom, IAM |
| Collectivités | Communes, Régions, Wilayas |
| Ministères | MEF, MTNRA, MHU, MS… |

### Adapter vos prompts au contexte marocain

Le champ **"Instructions supplémentaires"** de l'interface permet de guider le LLM :

```
Adapter la réponse au contexte marocain.
Utiliser le dirham marocain (MAD/DH) comme devise.
Respecter les exigences du Décret 2-22-431.
Mentionner les références CNSS et ICE de l'entreprise.
```

---

## Fonctionnement général

OffrIA génère **9 appels LLM en parallèle** pour chaque réponse AO — un brief stratégique suivi de
8 sections rédigées simultanément. Chaque section est enrichie de contexte documentaire via RAG (Qdrant).

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Client HTTP                                │
│  POST /api/v1/generate                                              │
│  { ao_texte, provider, model, contexte_entreprise, ... }            │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       GenerationService                             │
│                                                                     │
│  1. AOParserService      → parse le texte brut de l'AO             │
│     └─ extrait titre, référence, acheteur, critères, budget         │
│                                                                     │
│  2. Appel LLM #1 (brief stratégique)                               │
│     └─ analyse de l'AO + stratégie de réponse                      │
│                                                                     │
│  3. Pour chaque section (×8, en parallèle via asyncio.gather) :    │
│     ├─ RagService         → extraits Qdrant pertinents (optionnel) │
│     ├─ PromptBuilderService → prompt contextualisé par section      │
│     └─ Appel LLM          → rédaction de la section                │
│                                                                     │
│  4. Assemblage du GenerationResult                                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       GenerationResult                              │
│  { succes, provider_utilise, model_utilise,                         │
│    texte_complet, sections[], tokens_utilises }                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Cycle de vie d'une requête

### Étape 1 — La route reçoit la requête
**Fichier :** [app/api/routes/generation_routes.py](app/api/routes/generation_routes.py)

```python
POST /api/v1/generate
{ "ao_texte": "Marché public de...", "provider": "anthropic", "contexte_entreprise": {...} }

# FastAPI valide le corps avec Pydantic, puis appelle :
result = await service.generate(request)
```

### Étape 2 — Le parser structure l'AO
**Fichier :** [app/services/ao_parser_service.py](app/services/ao_parser_service.py)

Le texte brut de l'AO est analysé par regex pour en extraire :
- titre, référence, acheteur
- type de marché (services / travaux / fournitures)
- sections thématiques
- critères de sélection avec pondérations
- budget estimé et date limite

### Étape 3 — Brief stratégique (appel LLM #1)
**Fichier :** [app/services/generation_service.py](app/services/generation_service.py)

Un premier appel LLM génère un brief synthétique :
- analyse des enjeux de l'AO
- points de différenciation à valoriser
- stratégie argumentaire

Ce brief est réinjecté dans chaque prompt de section pour garantir la cohérence.

### Étape 4 — Sections en parallèle (8 appels LLM simultanés)
**Fichier :** [app/services/generation_service.py](app/services/generation_service.py)

```python
sections = await asyncio.gather(
    *[generate_section(cfg, brief, ao_context) for cfg in SECTION_CONFIGS]
)
```

Pour chaque section, dans cet ordre :

```python
# a) Récupération RAG (Qdrant) — optionnel, dégradation gracieuse
rag_context = await self._rag.retrieve_for_section(section_title, ao_context)

# b) Construction du prompt avec brief + contexte entreprise + extraits RAG
prompt = self._prompt_builder.build_section(cfg, brief, ao_context, rag_context)

# c) Appel LLM
section_text = await provider.generate_section(request, prompt)
```

Les 8 sections générées :

| # | Section |
|---|---------|
| 1 | Présentation de notre entreprise |
| 2 | Compréhension de vos besoins |
| 3 | Notre approche méthodologique |
| 4 | Moyens humains et techniques mobilisés |
| 5 | Références similaires |
| 6 | Planning prévisionnel |
| 7 | Proposition financière |
| 8 | Conclusion et engagements |

### Étape 5 — Assemblage et réponse

Les sections sont triées par ordre, assemblées en Markdown et retournées dans un `GenerationResult`.

```
ao_texte (string brute)
    │
    ▼ AOParserService
AppelOffre (objet structuré)
    │
    ▼ Appel LLM #1
Brief stratégique
    │
    ├──► [Section 1] ──► RAG + LLM ──┐
    ├──► [Section 2] ──► RAG + LLM ──┤
    ├──► ...                          ├──► GenerationResult
    └──► [Section 8] ──► RAG + LLM ──┘
```

---

## Architecture du projet

```
reponse_ao_generation/
│
├── app/                               # Application principale FastAPI
│   ├── main.py                        # Point d'entrée
│   │
│   ├── config/
│   │   └── settings.py                # Configuration via pydantic-settings (.env)
│   │
│   ├── models/
│   │   ├── appel_offre.py             # AppelOffre, Section, Critere, TypeMarche
│   │   └── generation.py             # GenerationRequest, GenerationResult, CompanyContext…
│   │
│   ├── providers/                     # Couche d'abstraction LLM
│   │   ├── base.py                    # AbstractLLMProvider (ABC)
│   │   ├── anthropic_provider.py
│   │   ├── openai_provider.py
│   │   ├── mistral_provider.py
│   │   └── provider_factory.py
│   │
│   ├── services/
│   │   ├── ao_parser_service.py       # Parse texte brut → AppelOffre structuré
│   │   ├── prompt_builder_service.py  # Construit les prompts par section
│   │   ├── generation_service.py      # Orchestration : brief + 8 sections en parallèle
│   │   └── rag_service.py             # Lecture Qdrant (read-only, dégradation gracieuse)
│   │
│   └── api/
│       ├── dependencies.py            # Injection de dépendances FastAPI
│       └── routes/
│           ├── generation_routes.py   # POST /api/v1/generate
│           ├── models_routes.py       # GET  /api/v1/models
│           └── rag_routes.py          # GET  /api/v1/rag/status · POST /api/v1/rag/index
│
├── rag_service/                       # Microservice ETL (démarrage indépendant)
│   ├── main.py                        # FastAPI : /health /status /index /reset
│   ├── etl.py                         # Pipeline : scan → hash → embed → upsert Qdrant
│   ├── manifest.py                    # Suivi SHA256 (knowledge_base/.rag_manifest.json)
│   ├── config.py                      # Pydantic settings du service ETL
│   ├── requirements.txt
│   └── Dockerfile
│
├── knowledge_base/                    # Documents sources (lus par rag-etl uniquement)
│   ├── references/                    # Réalisations et références clients
│   ├── methodologies/                 # Approches et méthodologies
│   ├── certifications/                # Certifications et qualifications
│   ├── company/                       # Présentation entreprise
│   └── templates/                     # Modèles de réponses AO
│
├── frontend/                          # Interface web React + Vite + Tailwind CSS
│   ├── src/
│   │   ├── components/                # Header, FormPanel, ResultPanel…
│   │   ├── hooks/                     # useGenerate, useRagStatus…
│   │   └── types.ts                   # Types TypeScript partagés
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── tests/
│   ├── unit/
│   │   ├── test_ao_parser.py
│   │   └── test_provider_factory.py
│   └── integration/
│       └── test_api.py
│
├── Dockerfile                         # Build multi-stage : Node → Python → final
├── docker-compose.yml                 # Production : qdrant + api (rag-etl sur profil "rag")
├── docker-compose.dev.yml             # Développement : hot-reload Python + Vite
├── requirements.txt
├── pytest.ini
└── .env.example
```

---

## Design patterns et principes POO

### Abstract Base Class + Strategy Pattern
`AbstractLLMProvider` définit une **interface commune** pour tous les LLMs.
Chaque provider concret implémente cette interface indépendamment.
Le reste de l'application ne dépend jamais d'un provider en particulier.

```python
# Interface commune — app/providers/base.py
class AbstractLLMProvider(ABC):
    async def generate(self, request, prompt) -> GenerationResult: ...
    def get_available_models(self) -> list[ModeleDisponible]: ...

# Implémentations concrètes
class AnthropicProvider(AbstractLLMProvider): ...  # Claude
class OpenAIProvider(AbstractLLMProvider): ...     # GPT
class MistralProvider(AbstractLLMProvider): ...    # Mistral
```

### Factory Pattern
`ProviderFactory` centralise la création des providers.
Ajouter un nouveau provider ne nécessite **aucune modification** du reste du code.

```python
provider = ProviderFactory.create("anthropic", api_key="...", model_name="claude-opus-4-6")
```

### Dependency Injection
FastAPI injecte automatiquement les services via `Depends()`.
Cela permet de remplacer les vrais services par des mocks dans les tests.

```python
async def generate_response(
    request: GenerationRequest,
    service: GenerationService = Depends(get_generation_service),  # injecté
): ...
```

### Singleton via @lru_cache
Les services sans état (`AOParserService`, `PromptBuilderService`, `Settings`)
sont instanciés une seule fois au démarrage grâce à `@lru_cache`.

---

## Installation

```bash
# 1. Cloner ou télécharger le projet
cd reponse_ao_generation

# 2. Créer et activer un environnement virtuel
python -m venv .venv
source .venv/bin/activate        # Linux/Mac
.venv\Scripts\activate           # Windows

# 3. Installer les dépendances
pip install -r requirements.txt
```

---

## Configuration

Copier le fichier d'exemple et renseigner les clés API :

```bash
cp .env.example .env
```

```dotenv
# .env — clés LLM (seule la clé du provider utilisé est requise)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
MISTRAL_API_KEY=...

# Provider et modèle par défaut
DEFAULT_PROVIDER=anthropic
DEFAULT_MODEL=claude-opus-4-6

# Application
APP_PORT=8000
APP_DEBUG=true

# RAG (optionnel — dégradation gracieuse si absent)
QDRANT_URL=http://qdrant:6333      # URL de la base vectorielle Qdrant
RAG_ETL_URL=http://rag-etl:8001   # URL du microservice ETL (pour proxy /index)
```

> Si `QDRANT_URL` n'est pas défini, la génération fonctionne normalement sans enrichissement RAG.

---

## Base de connaissances (RAG)

Le RAG (Retrieval-Augmented Generation) permet d'injecter automatiquement des extraits de vos
documents internes dans chaque section générée — références clients, méthodologies, certifications…

### Architecture RAG

```
knowledge_base/           ←  vos documents (PDF, DOCX, TXT)
      │
      ▼  (déclenchement manuel)
 rag-etl                  ←  microservice ETL indépendant
  ├─ scan + hash SHA256   ←  uniquement les fichiers nouveaux/modifiés
  ├─ chunking + embedding ←  OpenAI text-embedding-3-small
  └─ upsert Qdrant        ←  persistance dans le volume qdrant_data
      │
      ▼  (lecture à chaque génération)
   api + Qdrant           ←  recherche vectorielle par section
```

### Ajouter des documents

1. Déposez vos fichiers (`.pdf`, `.docx`, `.txt`) dans le dossier correspondant :

   | Dossier | Contenu |
   |---------|---------|
   | `knowledge_base/references/` | Réalisations clients, cas d'usage |
   | `knowledge_base/methodologies/` | Approches projets, frameworks |
   | `knowledge_base/certifications/` | ISO, qualifications, agréments |
   | `knowledge_base/company/` | Présentation entreprise, organigramme |
   | `knowledge_base/templates/` | Modèles de réponses AO |

2. Déclenchez l'indexation :

```bash
# Via le service ETL directement
curl -X POST http://localhost:8001/index

# Via l'API principale (proxy vers rag-etl)
curl -X POST http://localhost:8000/api/v1/rag/index

# Via l'interface OffrIA : bouton "Réindexer" dans l'en-tête
```

L'ETL est **incrémental** : seuls les fichiers nouveaux ou modifiés sont retraités.
Si un fichier est supprimé, ses vecteurs sont automatiquement retirés de Qdrant.

### Lancer la chaîne RAG (première fois)

**Étape 1 — Vérifier le `.env`**

```dotenv
OPENAI_API_KEY=sk-...           # requis pour les embeddings
QDRANT_URL=http://qdrant:6333
RAG_ETL_URL=http://rag-etl:8001
```

**Étape 2 — Démarrer la stack complète**

Le microservice `rag-etl` ne démarre **pas** automatiquement avec `docker compose up`.
Il faut l'activer via le profil `rag` :

```bash
# Démarre Qdrant + API + rag-etl
docker compose --profile rag up -d
```

**Étape 3 — Déclencher l'indexation**

```bash
curl -X POST http://localhost:8001/index
```

Ou via l'interface OffrIA : bouton **"Réindexer"** dans l'en-tête (actif seulement si rag-etl tourne).

**Étape 4 — Vérifier**

```bash
# Statut du microservice ETL
curl http://localhost:8001/status
# → { "vectors_count": 342, "manifest_entries": 12 }

# Statut vu depuis l'API principale
curl http://localhost:8000/api/v1/rag/status
# → { "ready": true, "chunk_count": 342, "etl_available": true }
```

**Pour les indexations suivantes** (après ajout de fichiers) :

```bash
# L'ETL est incrémental — saute les fichiers déjà indexés (SHA256)
curl -X POST http://localhost:8001/index
```

---

## Lancement

### Sans Docker

```bash
# Démarrer l'API
uvicorn app.main:app --reload

# Démarrer Qdrant (optionnel, pour le RAG)
docker run -p 6333:6333 qdrant/qdrant:v1.12.1
```

L'API est disponible sur `http://localhost:8000`.

### Avec Docker (recommandé)

```bash
# Production — démarre Qdrant + API
docker compose up -d

# Logs
docker compose logs -f api

# Avec le service ETL (pour indexer la knowledge_base)
docker compose --profile rag up -d

# Déclencher une indexation
curl -X POST http://localhost:8001/index

# Développement — hot-reload Python + Vite dev server
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

---

## Interface web

L'interface graphique React est accessible à [http://localhost:8000/ui/](http://localhost:8000/ui/).

```
┌─────────────────────────────────────────────────────────────────────┐
│  OffrIA          ● API active   RAG · 342 chunks   [Réindexer]     │
├──────────────────────┬──────────────────────────────────────────────┤
│                      │                                              │
│  01  Document AO     │     Zone de résultats                       │
│  ┌────────────────┐  │                                              │
│  │  Drop zone     │  │   Anthropic · claude-opus-4-6               │
│  │  .txt / .pdf   │  │   9 appels LLM · 8 247 tokens               │
│  └────────────────┘  │                                              │
│  ou coller le texte  │   ┌──────────────────────────────────────┐  │
│                      │   │ PRÉSENTATION DE L'ENTREPRISE         │  │
│  02  Modèle LLM      │   │ ...                                  │  │
│  ◆ Anthropic         │   └──────────────────────────────────────┘  │
│  ○ OpenAI            │   ┌──────────────────────────────────────┐  │
│  ⟡ Mistral           │   │ COMPRÉHENSION DES BESOINS            │  │
│  [claude-opus-4-6 ▼] │   │ ...                                  │  │
│                      │   └──────────────────────────────────────┘  │
│  03  Entreprise      │                                              │
│  [Nom ____________]  │                                              │
│  [Description _____] │                                              │
│                      │                                              │
│  04  Paramètres      │                                              │
│  Créativité ━━●━━    │                                              │
│  Tokens [4096]       │                                              │
│                      │                                              │
│  [ Générer →       ] │                                              │
└──────────────────────┴──────────────────────────────────────────────┘
```

**Fonctionnalités :**
- Dépôt de fichier AO par glisser-déposer (`.txt` ou `.pdf`)
- Sélection du provider LLM par cartes cliquables
- Modèles disponibles chargés dynamiquement depuis l'API
- Résultats affichés section par section avec rendu Markdown
- En-tête : statut RAG en temps réel + bouton "Réindexer" (actif seulement si rag-etl est démarré)
- Bouton "Copier" pour récupérer la réponse complète

---

## API Reference

### `GET /health`
Healthcheck minimal.

### `GET /api/v1/models`
Liste tous les modèles disponibles, tous providers confondus.

### `GET /api/v1/models/providers`
Liste les identifiants des providers enregistrés.
**Réponse :** `["openai", "anthropic", "mistral"]`

### `GET /api/v1/models/{provider}`
Liste les modèles d'un provider spécifique.

### `POST /api/v1/generate`
**Point d'entrée principal.** Génère une réponse à un appel d'offres (9 appels LLM).

**Corps de la requête :**
```json
{
  "ao_texte": "Appel d'offres ouvert n° 12/2024...",
  "provider": "anthropic",
  "model": "claude-opus-4-6",
  "contexte_entreprise": {
    "nom": "DataTech Maroc SARL",
    "description": "Société de conseil en transformation digitale",
    "expertises": ["développement web", "cloud AWS", "intelligence artificielle"],
    "references": ["SI RH – Région Souss-Massa", "Portail citoyen – Commune de Marrakech"],
    "effectif": 45,
    "chiffre_affaires": "12M DH"
  },
  "instructions_supplementaires": "Adapter au contexte marocain. Mentionner RC, CNSS, ICE.",
  "temperature": 0.7,
  "max_tokens": 4096
}
```

**Réponse :**
```json
{
  "succes": true,
  "provider_utilise": "anthropic",
  "model_utilise": "claude-opus-4-6",
  "texte_complet": "## Présentation de notre entreprise\n...",
  "sections": [
    { "titre": "Présentation de notre entreprise", "contenu": "...", "ordre": 0 },
    { "titre": "Compréhension de vos besoins",     "contenu": "...", "ordre": 1 }
  ],
  "tokens_utilises": 8247,
  "erreur": null
}
```

### `GET /api/v1/rag/status`
Statut de la base de connaissances RAG.

**Réponse :**
```json
{
  "ready": true,
  "doc_count": 0,
  "chunk_count": 342,
  "document_types": {
    "references": "Références et réalisations",
    "methodologies": "Méthodologies et approches",
    "certifications": "Certifications et qualifications",
    "company": "Présentation entreprise",
    "templates": "Modèles de réponses AO"
  },
  "etl_available": true
}
```

### `POST /api/v1/rag/index`
Déclenche l'indexation ETL (proxie vers rag-etl).
Retourne `503` si le service rag-etl n'est pas démarré.

**Codes d'erreur `POST /api/v1/generate` :**

| Code | Cause |
|------|-------|
| `400` | Clé API manquante, provider inconnu, AO trop court |
| `422` | Corps de requête invalide (validation Pydantic) |
| `502` | Échec de l'appel LLM (auth, quota, timeout) |
| `503` | Service rag-etl non disponible (pour /rag/index) |
| `500` | Erreur interne inattendue |

---

## Choisir son modèle LLM

| Provider | Modèle | Usage recommandé |
|----------|--------|------------------|
| `anthropic` | `claude-opus-4-6` | AO complexes, réponses très structurées (**défaut**) |
| `anthropic` | `claude-sonnet-4-6` | Bon équilibre qualité/coût |
| `anthropic` | `claude-haiku-4-5-20251001` | AO simples, génération rapide |
| `openai` | `gpt-4o` | Polyvalent, multimodal (**défaut**) |
| `openai` | `gpt-4o-mini` | Économique et rapide |
| `openai` | `o1` | AO très techniques nécessitant un raisonnement approfondi |
| `mistral` | `mistral-large-latest` | Alternative souveraine européenne (**défaut**) |
| `mistral` | `mistral-small-latest` | Version économique |

---

## Ajouter un nouveau provider

1. **Créer** `app/providers/mon_provider.py` :

```python
from app.providers.base import AbstractLLMProvider
from app.models.generation import GenerationRequest, GenerationResult, ModeleDisponible

MON_MODELS = [
    ModeleDisponible(provider="mon_provider", model_id="mon-model-v1", description="...", defaut=True),
]

class MonProvider(AbstractLLMProvider):
    @property
    def provider_name(self) -> str:
        return "mon_provider"

    @property
    def default_model(self) -> str:
        return "mon-model-v1"

    def get_available_models(self) -> list[ModeleDisponible]:
        return MON_MODELS

    async def generate(self, request: GenerationRequest, prompt: str) -> GenerationResult:
        # Appel API ici
        ...
```

2. **Enregistrer** dans `app/providers/provider_factory.py` :

```python
from app.providers.mon_provider import MonProvider

_registry = {
    "openai":       OpenAIProvider,
    "anthropic":    AnthropicProvider,
    "mistral":      MistralProvider,
    "mon_provider": MonProvider,   # ← ajouter cette ligne
}
```

3. **Ajouter** la clé API dans `app/config/settings.py` et `.env.example`.

C'est tout. Aucune autre modification n'est nécessaire.

---

## Tests

```bash
# Tous les tests
pytest

# Tests unitaires uniquement (sans Docker ni clé API)
pytest tests/unit/

# Tests d'intégration (avec mocks, sans clé API réelle)
pytest tests/integration/

# Avec rapport de couverture
pytest --cov=app --cov-report=html
```

Les tests d'intégration utilisent des mocks pour simuler les appels LLM :
aucune clé API n'est nécessaire pour les exécuter.

---

## Docker

```bash
# Build des images
docker compose build

# Démarrage production (Qdrant + API)
docker compose up -d

# Démarrage avec le service ETL (indexation knowledge_base)
docker compose --profile rag up -d

# Logs en temps réel
docker compose logs -f api
docker compose logs -f rag-etl

# Arrêt et suppression des containers
docker compose down

# Arrêt avec suppression du volume Qdrant (⚠ efface les vecteurs)
docker compose down -v

# Développement — hot-reload Python + Vite dev server (port 5173)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Le Dockerfile utilise un **build multi-stage** :
- Étape `frontend-builder` : build React avec Node.js
- Étape `builder` : installe les dépendances Python
- Étape `final` : image légère sans outils de build, utilisateur non-root
