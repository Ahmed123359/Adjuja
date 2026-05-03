# Offre Technique : Architecture et Décisions de Conception

## 1. Contexte et objectif

L'offre technique est le document soumis par un prestataire en réponse à un appel d'offres public. Elle doit convaincre l'acheteur que l'entreprise a compris les enjeux du projet et que sa solution est la plus robuste. Elle est structurée autour de cinq composantes : la méthodologie, les moyens humains et matériels, le planning d'exécution, la note RSE, et les fiches techniques.

Le module **Offre Technique** d'OffrIA a pour rôle de générer automatiquement ce document à partir du CPS (Cahier des Prescriptions Spéciales) et du profil de l'entreprise, en produisant un rendu DOCX et PDF téléchargeable.

---

## 2. Problèmes à éviter absolument

### 2.1 Homogénéisation des offres

C'est le risque le plus grave. Avec une architecture naïve :

```
Même CPS + Même prompt + Même modèle = Même squelette d'offre
```

Si deux entreprises concurrentes utilisent la plateforme pour répondre au même appel d'offres, elles obtiendraient des documents structurellement identiques. Un acheteur public qui reçoit cinq offres avec le même niveau de langage et les mêmes formulations détecte immédiatement la répétition. Cela discrédite les deux entreprises et invalide la valeur du produit.

**Solution :** introduire une couche stratégique qui choisit un angle narratif propre à chaque entreprise avant toute génération de contenu.

### 2.2 Qualité insuffisante

L'offre technique est le miroir du prestataire. Une offre incohérente, incomplète ou générique est pire qu'une offre absente. Trois dimensions de qualité doivent être contrôlées :

| Dimension  | Ce qu'elle mesure                                           |
| ---------- | ----------------------------------------------------------- |
| Conformité | Chaque exigence du CPS est-elle adressée ?                  |
| Cohérence  | L'équipe, la méthodologie et le planning sont-ils alignés ? |
| Persuasion | L'angle narratif est-il maintenu de bout en bout ?          |

**Solution :** une porte de qualité automatique après génération, avec score par section et régénération ciblée si le score est insuffisant.

### 2.3 Couplage à OpenAI pour les embeddings

Le RAG actuel utilise `text-embedding-3-small` (OpenAI) et `gpt-4o-mini` pour le reranking. Cela introduit une dépendance externe non nécessaire puisque l'application utilise déjà Mistral pour toutes les autres opérations.

**Solution :** migrer vers `mistral-embed` pour les embeddings et `mistral-small-latest` pour le reranking.

### 2.4 Sécurité LLM

Les systèmes RAG et de génération sont exposés à des classes d'attaques documentées dans l'OWASP LLM Top 10 (2025). Les risques prioritaires pour ce module sont les suivants :

| Risque                           | Description                                                                         | Mesure retenue                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| LLM01 Injection de prompt        | L'utilisateur insère des instructions dans le texte du CPS pour détourner le modèle | Délimiteurs XML autour du contenu utilisateur, détection de patterns connus |
| LLM03 Empoisonnement RAG         | Un document malveillant indexé dans Qdrant contamine les réponses générées          | Validation du contenu à l'ingestion, traçabilité de la provenance           |
| LLM04/LLM10 Déni de portefeuille | Des requêtes répétées ou mal contraintes épuisent le budget API                     | Circuit breaker par utilisateur avec plafond de tokens par appel            |
| LLM06 Fuite d'information        | Le modèle reproduit le système de prompt ou des données sensibles                   | Le système de prompt ne contient aucune donnée opérationnelle sensible      |

L'approche retenue est la **défense en profondeur** : contrôles distribués sur la couche entrée, la couche prompt, la couche base de connaissances et la couche infrastructure. Pas de solution unique, pas de sur-ingénierie.

---

## 3. Architecture en cinq couches

| Couche | Nom | Entrée | Traitement | Sortie |
|--------|-----|--------|------------|--------|
| 0 | Company DNA | Données brutes de l'entreprise | Profil riche : ton d'écriture, certifications, références passées, CVs de l'équipe. Stocké dans une collection Qdrant dédiée par entreprise. | `CompanyDNA` injecté dans toutes les couches suivantes |
| 1 | Analyse CPS | PDF du CPS uploadé | Extraction par PyMuPDF + LLM : scope du projet, délais imposés, plan RC obligatoire, critères de pondération. Score de correspondance entreprise vs exigences. | `CPSContext` : objet structuré avec tous les champs extraits |
| 2 | Moteur de stratégie | `CPSContext` + `CompanyDNA` | Sélection de l'angle narratif selon le profil de l'entreprise (track record, innovation, proximité locale, etc.). Identification des différenciateurs à mettre en avant section par section. | `StrategyAngle` : angle choisi + liste de différenciateurs par section |
| 3 | Génération différenciée | `StrategyAngle` + contexte RAG | 5 appels Mistral lancés en parallèle via `asyncio.gather`. Chaque appel reçoit le `StrategyAngle`, un prompt spécialisé et les extraits RAG pertinents (mistral-embed + Qdrant). | 5 sections rédigées : méthodologie, moyens, planning, RSE, fiches techniques |
| 4 | Porte de qualité | Les 5 sections + `CPSContext` | Évaluation automatique sur trois scores : conformité CPS, cohérence interne, différenciation. Si un score est sous le seuil, la section défaillante est renvoyée en couche 3 (max 2 tentatives). Assemblage DOCX + PDF si tout est validé. | `offre_technique.docx` + `offre_technique.pdf` |

---

## 4. Rôle précis de chaque fichier nouveau/modifié

### Nouveaux fichiers

**`app/db/base.py`**
Crée l'engine asyncpg et la session factory SQLAlchemy. Point d'entrée unique pour toutes les connexions à PostgreSQL. Remplace les trois `sqlite3.connect()` dispersés dans les services.

**`app/db/models.py`**
Définit les trois tables ORM : `User`, `Launch`, `Usage`. Remplace les `CREATE TABLE IF NOT EXISTS` écrits à la main dans chaque service.

**`app/db/migrations/versions/001_initial.py`**
Première migration Alembic : crée les tables en base. Remplace les `ALTER TABLE ADD COLUMN` utilisés comme workaround dans les services existants.

**`app/services/security/input_sanitizer.py`**
Valide tout contenu utilisateur avant qu'il entre dans un prompt LLM : longueur maximale, délimiteurs XML pour séparer le contenu des instructions, détection de patterns d'injection connus. Couvre LLM01 et LLM06.

**`app/services/security/budget_guard.py`**
Vérifie le quota de l'utilisateur avant chaque appel LLM. Impose un plafond de tokens par requête. Retourne HTTP 429 si le budget est épuisé sans déclencher d'appel API. Couvre LLM04 et LLM10.

**`app/services/offre_technique/cps_analyzer.py`**
Reçoit le PDF du CPS, extrait le texte via PyMuPDF, puis appelle Mistral pour structurer le résultat en `CPSContext` (scope, délais, plan RC, critères pondérés).

**`app/services/offre_technique/strategy_engine.py`**
Compare le `CPSContext` avec le `CompanyDNA` et sélectionne l'angle narratif le plus pertinent. Produit un `StrategyAngle` injecté dans tous les prompts de génération.

**`app/services/offre_technique/section_generator.py`**
Lance les 5 appels Mistral en parallèle via `asyncio.gather`. Chaque coroutine reçoit le prompt de sa section, le `StrategyAngle` et le contexte RAG récupéré depuis Qdrant.

**`app/services/offre_technique/quality_gate.py`**
Évalue les sections générées sur trois axes : conformité (exigences CPS couvertes), cohérence (alignement équipe/méthode/planning), différenciation (angle maintenu). Déclenche une régénération ciblée si un score est sous le seuil (max 2 tentatives).

**`app/services/offre_technique/doc_assembler.py`**
Assemble les sections validées dans un DOCX avec python-docx (Gantt en tableau natif). Convertit ensuite en PDF. Produit les deux fichiers dans `data/offre_technique_tmp/<job_id>/`.

**`app/services/offre_technique/prompts.py`**
Contient les prompts système spécifiques à chaque section. Séparés du code pour faciliter les ajustements sans toucher à la logique.

**`app/api/routes/offre_technique_routes.py`**
Expose deux endpoints : `POST /api/v1/offre-technique/run` pour lancer le pipeline et `GET /api/v1/offre-technique/download/{job_id}/{file}` pour récupérer les fichiers produits.

**`app/api/middleware/budget_guard.py`**
Middleware FastAPI qui intercepte les requêtes vers les routes LLM et vérifie le quota avant de laisser passer la requête.

**`rag_service/ingestion_validator.py`**
Valide chaque document avant indexation dans Qdrant : détecte les patterns d'injection dans le contenu, impose une taille maximale par chunk, enregistre la provenance (source, date, user_id) dans le payload. Couvre LLM03.

### Fichiers existants modifiés

**`app/config/settings.py`**
Ajout de `DATABASE_URL` et `POSTGRES_PASSWORD`. Suppression de `OPENAI_API_KEY`.

**`app/services/rag_service.py`**
Remplacement de l'appel `openai.embeddings.create` par un appel HTTP vers `mistral-embed`. Remplacement de `gpt-4o-mini` par `mistral-small-latest` pour le reranking.

**`app/services/history_service.py`**
Remplacement de `sqlite3` synchrone par SQLAlchemy async. Suppression du `threading.Lock`.

**`app/services/usage_service.py`**
Même migration que `history_service.py`.

**`app/services/user_service.py`**
Même migration que `history_service.py`.

**`app/api/dependencies.py`**
Câblage des sessions async PostgreSQL. Injection du nouveau `budget_guard` et de `input_sanitizer` dans les routes de génération.

**`rag_service/etl.py`**
Remplacement de l'appel OpenAI embed par `mistral-embed`.

**`docker-compose.dev.yml`**
Ajout du service `postgres:16-alpine` avec volume persistant.

**`requirements.txt`**
Ajout de `asyncpg`, `sqlalchemy[asyncio]`, `alembic`. Suppression de `openai`.

---

## 5. Structure des fichiers

### Nouveaux fichiers (à créer)

```
app/
├── db/
│   ├── base.py                         # Engine asyncpg + session factory SQLAlchemy
│   ├── models.py                       # ORM : User, Launch, Usage
│   └── migrations/
│       ├── env.py
│       └── versions/
│           └── 001_initial.py
│
├── services/
│   ├── security/
│   │   ├── input_sanitizer.py          # Délimiteurs XML, détection injection, longueur max
│   │   └── budget_guard.py             # Circuit breaker tokens par utilisateur
│   │
│   └── offre_technique/
│       ├── cps_analyzer.py             # Extrait scope, délais, plan RC depuis le PDF
│       ├── strategy_engine.py          # Sélectionne l'angle narratif selon le profil
│       ├── section_generator.py        # 5 appels LLM parallèles (asyncio.gather)
│       ├── quality_gate.py             # Score conformité + cohérence + différenciation
│       ├── doc_assembler.py            # Compose le DOCX et le PDF final
│       └── prompts.py                  # Prompts système par section
│
├── api/
│   ├── routes/
│   │   └── offre_technique_routes.py   # POST /run, GET /download/{job_id}/{file}
│   └── middleware/
│       └── budget_guard.py             # Middleware FastAPI vérifiant le quota avant appel LLM
│
└── main.py                             # Mise à jour : lifespan async pour init DB

rag_service/
└── ingestion_validator.py              # Validation anti-empoisonnement à l'ingestion

alembic.ini                             # Configuration Alembic
```

### Fichiers existants à mettre à jour

```
app/config/settings.py          # Ajout DATABASE_URL, retrait OPENAI_API_KEY
app/services/rag_service.py     # Remplacement OpenAI embed -> mistral-embed
app/services/history_service.py # sqlite3 synchrone -> SQLAlchemy async
app/services/usage_service.py   # idem
app/services/user_service.py    # idem
app/api/dependencies.py         # Câblage des nouveaux services async
rag_service/etl.py              # Remplacement OpenAI embed -> mistral-embed
docker-compose.dev.yml          # Ajout service PostgreSQL
requirements.txt                # asyncpg, sqlalchemy[asyncio], alembic
```

### Ce qui ne change pas

```
app/services/filler/                # Inchangé
app/services/generation_service.py  # Mise à jour légère : injection input_sanitizer
app/api/routes/*                    # Inchangés sauf ajout offre_technique_routes.py
worker/                             # Non touché
```

---

## 5. Flux complet d'une requête

```
1.  Utilisateur uploade le CPS (PDF) via le frontend
2.  input_sanitizer valide la taille et détecte les patterns d'injection
3.  budget_guard vérifie que le quota utilisateur n'est pas épuisé
4.  cps_analyzer extrait : scope, délais, plan RC, critères pondérés -> CPSContext
5.  strategy_engine compare CPSContext + Company DNA -> StrategyAngle (angle narratif)
6.  section_generator lance 5 appels Mistral en parallèle (asyncio.gather)
    chaque appel reçoit : angle stratégique + contexte RAG Qdrant (mistral-embed)
7.  quality_gate évalue les 5 sections : conformité, cohérence, différenciation
    si une section est défaillante -> régénération ciblée (max 2 tentatives)
8.  doc_assembler compose le DOCX final avec Gantt en tableau natif python-docx
9.  Conversion DOCX -> PDF
10. Les deux fichiers sont disponibles en téléchargement via /api/v1/offre-technique/download/
```

---

## 6. Variables d'environnement ajoutées

```env
# Base de données PostgreSQL
DATABASE_URL=postgresql+asyncpg://offria:password@localhost:5432/offria
POSTGRES_PASSWORD=changeme_en_prod

# RAG (Mistral uniquement, OpenAI retiré)
QDRANT_URL=http://localhost:6333
# OPENAI_API_KEY supprimé : mistral-embed remplace text-embedding-3-small
```

---

## 7. Ordre d'implémentation

```
Étape 1 : Migration PostgreSQL
          db/base.py, db/models.py, alembic, mise à jour des 3 services

Étape 2 : RAG Mistral Embed
          rag_service.py, etl.py, ingestion_validator.py

Étape 3 : Sécurité entrée et budget
          input_sanitizer.py, budget_guard.py, câblage dans generation_service

Étape 4 : Offre technique
          cps_analyzer -> strategy_engine -> section_generator -> quality_gate -> doc_assembler

Étape 5 : Frontend
          OffreTechniqueTab (même pattern que FillerTab)
```
