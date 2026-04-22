# Intégration du Remplissage Automatique de Dossiers AO

Ce document explique en détail comment le module de remplissage automatique ("filler") a été intégré dans le projet **OffrIA**. Il couvre la structure des fichiers, le rôle de chaque composant, et la façon dont les différentes couches (pipeline, service, API, frontend) communiquent entre elles.

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture générale](#2-architecture-générale)
3. [Backend](#3-backend)
   - [3.1 Le package filler](#31-le-package-appservicesfiller)
   - [3.2 L'adaptateur entreprise](#32-ladaptateur-entreprise-company_adapterpy)
   - [3.3 Les modèles Pydantic](#33-les-modèles-pydantic-appmodelsfillerpyy)
   - [3.4 Le service asynchrone](#34-le-service-asynchrone-appservicesfiller_servicepy)
   - [3.5 Les routes API](#35-les-routes-api-appapiroutesfiller_routespy)
   - [3.6 Câblage dans l'application](#36-câblage-dans-lapplication)
   - [3.7 Dépendances ajoutées](#37-dépendances-ajoutées)
4. [Frontend](#4-frontend)
   - [4.1 Les types TypeScript](#41-les-types-typescript-frontendsrctypests)
   - [4.2 Les fonctions API](#42-les-fonctions-api-frontendsrcapits)
   - [4.3 Le composant FillerTab](#43-le-composant-fillertab-frontendsrccomponentsfillertabtsx)
   - [4.4 Intégration dans le panneau Outils](#44-intégration-dans-le-panneau-outils-rightpaneltsx)
5. [Cycle de vie d'une requête](#5-cycle-de-vie-dune-requête)
6. [Stockage des fichiers temporaires](#6-stockage-des-fichiers-temporaires)

---

## 1. Vue d'ensemble

Le filler est un pipeline d'intelligence artificielle qui prend en entrée un **dossier PDF de candidature AO** et produit en sortie les documents remplis automatiquement (acte d'engagement, déclaration sur l'honneur, bordereau des prix, etc.).

Le pipeline existait initialement dans le projet `tache-01-02` sous forme de scripts Python autonomes. L'intégration dans OffrIA consiste à :

- Réorganiser le code en package Python propre (`app/services/filler/`)
- Brancher le pipeline sur les données d'entreprise stockées dans `company_defaults.json`
- Exposer une route FastAPI sécurisée qui reçoit le PDF et retourne des liens de téléchargement
- Créer un onglet dédié dans l'interface React

---

## 2. Architecture générale

```
Navigateur (React)
    |
    | POST /api/v1/filler/run   (multipart : fichier PDF + paramètres)
    v
app/api/routes/filler_routes.py     <- validation, auth, délégation
    |
    v
app/services/filler_service.py      <- orchestration async, gestion des fichiers temp
    |
    | asyncio.to_thread(...)         <- le pipeline est synchrone et long (30-90s)
    v
app/services/filler/
    filler_orchestrator.py           <- point d'entrée du pipeline
    filler_segmenter.py              <- découpe le PDF par type de document
    filler_page_detector.py          <- détecte quel document est sur quelle page
    filler_case_extractor.py         <- extrait uniquement le cas juridique sélectionné
    filler_processors.py             <- trois pipelines : texte, DOCX, scanné
    filler_llm.py                    <- appels à Mistral (texte) et Pixtral (images)
    filler_table_extractor.py        <- extrait les tableaux vers Excel
    prompts.py                       <- tous les prompts LLM
    filler_settings.py               <- constantes et registres de documents
    company_adapter.py               <- lit company_defaults.json et formate les données
    |
    v
data/filler_tmp/<job_id>/output/    <- fichiers produits (.pdf, .docx, .xlsx)
    |
    v
GET /api/v1/filler/download/<job_id>/<filename>   <- téléchargement sécurisé
```

---

## 3. Backend

### 3.1 Le package `app/services/filler/`

C'est le coeur du système. Chaque fichier a un rôle précis :

#### `filler_settings.py`

Contient toutes les constantes du pipeline :

- `DOCUMENT_REGISTRY` : dictionnaire qui liste tous les types de documents connus (acte d'engagement, déclaration d'honneur, bordereau des prix, etc.) avec pour chacun son action (`"fill"` ou `"extract_table"`), si il est sensible au cas juridique, au numéro de lot, et quel format de sortie produire.
- `CASE_REGISTRY` : pour chaque document, les variantes juridiques supportées (société, personne physique, auto-entrepreneur, etc.) avec les mots-clés permettant de les délimiter dans le PDF.
- `LOT_REGISTRY` : configuration des sections par lot.
- Les noms de modèles Mistral utilisés, les seuils de détection, les paramètres d'image.

#### `prompts.py`

Contient tous les prompts envoyés aux modèles LLM :

- `TEXT_SYSTEM_PROMPT` : prompt système pour le remplissage de documents texte via Mistral.
- `get_vision_prompt(doc_type)` : prompt vision pour les pages scannées via Pixtral.
- `get_vision_prompt_case(doc_type, case_name, ...)` : variante enrichie qui précise à Pixtral quel cas juridique extraire.
- `TABLE_EXTRACTION_PROMPT` : prompt pour l'extraction de tableaux de prix.

#### `filler_page_detector.py`

Détecte à quelle page appartient quel type de document. Utilise une stratégie en 4 niveaux :

1. Score par mots-clés (le plus rapide)
2. OCR des en-têtes si le score est insuffisant
3. Analyse de la mise en page (fallback)
4. Attribution à toutes les pages si rien n'est détecté

#### `filler_segmenter.py`

Prend les résultats de `filler_page_detector` et les regroupe en segments : `{ "acte_engagement": [0, 1, 2], "declaration_honneur": [3, 4], ... }`. C'est ce dictionnaire qui pilote ensuite l'orchestrateur.

#### `filler_case_extractor.py`

Pour les documents avec plusieurs variantes juridiques (ex : l'acte d'engagement a des sections différentes pour une société et pour une personne physique), ce module extrait uniquement les blocs correspondant au cas sélectionné et rédige (rectangle blanc) les sections des autres cas.

#### `filler_llm.py`

Couche d'accès aux modèles LLM :

- `call_mistral(lines, api_key, company_info)` : envoie des lignes avec des placeholders (`{{NOM_ENTREPRISE}}`, etc.) à Mistral et reçoit un JSON avec les valeurs remplies.
- `call_pixtral_vision(images, api_key, doc_type, company_info)` : envoie des captures d'écran de pages scannées à Pixtral (modèle multimodal) pour lecture et remplissage.
- `_post_with_retry(payload, api_key)` : gère les tentatives automatiques en cas de rate limiting (HTTP 429).

La clé API Mistral est **toujours passée en paramètre** et jamais lue depuis une variable globale. Elle vient de `settings.mistral_api_key` au moment de la requête.

#### `filler_processors.py`

Contient les trois pipelines de traitement selon le type de PDF :

- `process_text_pdf` : pour les PDFs avec texte extractible. Utilise PyMuPDF pour lire et modifier directement les blocs de texte.
- `process_docx` : pour les fichiers Word convertis en PDF, retravaille la structure DOCX.
- `process_scanned_pdf` : pour les PDFs numérisés (images). Convertit les pages en images avec `pdf2image`, les envoie à Pixtral, puis reconstruit un DOCX et un PDF à partir de la réponse.

#### `filler_table_extractor.py`

Pipeline spécialisé pour les bordereaux de prix. Extrait les tableaux du PDF et les convertit en fichier Excel (`.xlsx`) avec `openpyxl`.

#### `filler_orchestrator.py`

Point d'entrée principal du pipeline. Sa fonction `run(pdf_path, profile, api_key, output_dir)` :

1. Détecte si le PDF est scanné ou texte.
2. Lance la segmentation pour identifier les types de documents présents.
3. Pour chaque segment détecté, consulte `DOCUMENT_REGISTRY` pour connaître l'action à exécuter.
4. Dispatche vers `_handle_fill()` ou `_handle_extract_table()`.
5. Retourne une liste de `ProcessingResult` (un par type de document traité).

---

### 3.2 L'adaptateur entreprise `company_adapter.py`

Le pipeline a besoin d'un dictionnaire `COMPANY_INFO` avec des clés précises (`company_name`, `ice`, `rc_number`, etc.). Dans `tache-01-02`, ce dictionnaire était codé en dur. Dans OffrIA, les données d'entreprise viennent du fichier `company_defaults.json` géré par l'utilisateur depuis l'interface.

`company_adapter.py` fait la traduction :

```python
def get_company_info() -> dict[str, str]:
    raw     = _load_defaults()           # lit company_defaults.json
    company = raw.get("company", {})
    return {
        "company_name":    company.get("nom", ""),
        "manager_name":    company.get("nom", ""),
        "manager_quality": company.get("forme_juridique", "Gérant"),
        "phone":           company.get("telephone", ""),
        "rc_number":       company.get("rc", ""),
        "ice":             company.get("ice", ""),
        "cnss":            company.get("cnss", ""),
        "tp_number":       company.get("if_fiscal", ""),
        # les champs financiers sont laissés vides, le LLM les déduit du document
        "amount_ht": "", "tva_rate": "20%", ...
    }
```

---

### 3.3 Les modèles Pydantic `app/models/filler.py`

Définit les types de données utilisés par l'API :

```python
class CompanyCase(str, Enum):
    SOCIETE           = "societe"
    PERSONNE_PHYSIQUE = "personne_physique"
    AUTO_ENTREPRENEUR = "auto_entrepreneur"
    GROUPEMENT        = "groupement"
    COOPERATIVE       = "cooperative"
    ETABLISSEMENT     = "etablissement_public"

class FillerOutputFile(BaseModel):
    doc_type:     str   # ex: "acte_engagement"
    filename:     str   # ex: "acte_engagement_societe_lot1_filled.pdf"
    format:       str   # "pdf", "docx" ou "excel"
    download_url: str   # ex: "/api/v1/filler/download/<job_id>/<filename>"

class FillerResult(BaseModel):
    job_id:   str                    # identifiant unique du traitement
    succes:   bool                   # True si au moins un fichier produit
    fichiers: list[FillerOutputFile] # liste des fichiers téléchargeables
    erreurs:  list[str]              # erreurs non fatales (un doc échoué n'annule pas les autres)
    message:  str                    # message de statut lisible
```

---

### 3.4 Le service asynchrone `app/services/filler_service.py`

Le pipeline de remplissage est **synchrone et long** (30 à 90 secondes). Pour ne pas bloquer la boucle d'événements de FastAPI, le service utilise `asyncio.to_thread()` :

```
async run_filler(pdf_bytes, filename, company_case, lots, api_key)
    |
    | 1. Crée un dossier isolé : data/filler_tmp/<job_id>/
    | 2. Sauvegarde le PDF uploadé dans ce dossier
    | 3. Lance le pipeline dans un thread séparé (non bloquant)
    |       asyncio.to_thread(_run_pipeline, ...)
    | 4. Collecte les fichiers produits dans output/
    | 5. Construit et retourne un FillerResult
```

La fonction `_collect_output_files` parcourt les résultats de l'orchestrateur. Pour chaque résultat réussi, elle cherche le fichier principal **et tous ses fichiers compagnons** (même nom de fichier, extensions différentes). Par exemple, si l'orchestrateur produit `acte_engagement_societe_filled.pdf` et `acte_engagement_societe_filled.docx`, les deux sont retournés comme fichiers téléchargeables.

La fonction `get_output_file_path(job_id, filename)` est utilisée par la route de téléchargement pour retrouver un fichier produit par son identifiant de job et son nom.

---

### 3.5 Les routes API `app/api/routes/filler_routes.py`

Deux routes sont exposées, toutes les deux protégées par authentification JWT (`Depends(get_current_user)`) :

#### `POST /api/v1/filler/run`

Reçoit un formulaire multipart avec :
- `file` : le PDF du dossier AO (max 50 Mo)
- `company_case` : le type de soumissionnaire (valeur de l'enum `CompanyCase`)
- `lots` : numéros de lots séparés par des virgules, ex : `"1,2"` (vide = tous les lots)

Validations effectuées avant de lancer le pipeline :
- Le fichier doit avoir l'extension `.pdf`
- La taille ne doit pas dépasser 50 Mo
- Le fichier ne doit pas être vide (moins de 1 Ko)
- La clé API Mistral doit être configurée dans les paramètres

Retourne un `FillerResult` avec les fichiers produits et leurs URLs de téléchargement.

#### `GET /api/v1/filler/download/{job_id}/{filename}`

Télécharge un fichier produit par un traitement précédent. Le nom de fichier est vérifié pour prévenir les attaques de type "path traversal" (présence de `..`, `/` ou `\` interdite). Retourne le fichier avec le bon type MIME selon l'extension.

---

### 3.6 Câblage dans l'application

Trois fichiers modifiés pour brancher le filler dans l'application existante :

**`app/api/routes/__init__.py`**

```python
from app.api.routes.filler_routes import router as filler_router
```

**`app/main.py`**

```python
from app.api.routes import (..., filler_router)
app.include_router(filler_router, prefix="/api/v1")
```

**`app/config/settings.py`**

Ajout de `extra="ignore"` dans `SettingsConfigDict` pour que les variables d'environnement inconnues (comme les `WORKER_*` du projet `tache-01-02`) soient ignorées au lieu de faire planter le démarrage.

---

### 3.7 Dépendances ajoutées

**`requirements.txt`**

```
pdf2image==1.17.0       # conversion PDF en images pour les PDFs scannés
pytesseract==0.3.13     # OCR pour la détection des en-têtes de pages
pdf2docx==0.5.8         # conversion PDF vers DOCX
```

**`Dockerfile`** (étape builder)

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        tesseract-ocr-fra \
        poppler-utils \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
    && rm -rf /var/lib/apt/lists/*
```

Ces packages système sont requis par `pytesseract` (Tesseract OCR) et `pdf2image` (Poppler).

---

## 4. Frontend

### 4.1 Les types TypeScript `frontend/src/types.ts`

Trois types ajoutés pour correspondre aux modèles Pydantic du backend :

```typescript
type CompanyCase =
  | 'societe'
  | 'personne_physique'
  | 'auto_entrepreneur'
  | 'groupement'
  | 'cooperative'
  | 'etablissement_public';

interface FillerOutputFile {
  doc_type:     string;
  filename:     string;
  format:       string;  // "pdf" | "docx" | "excel"
  download_url: string;
}

interface FillerResult {
  job_id:   string;
  succes:   boolean;
  fichiers: FillerOutputFile[];
  erreurs:  string[];
  message:  string;
}
```

---

### 4.2 Les fonctions API `frontend/src/api.ts`

Deux fonctions ajoutées, toutes les deux utilisent `authHeaders()` pour envoyer le token JWT :

#### `runFiller(file, companyCase, lots)`

Envoie le PDF et les paramètres au backend via un formulaire multipart :

```typescript
const form = new FormData();
form.append('file', file);
form.append('company_case', companyCase);
form.append('lots', lots.join(','));

const res = await fetch('/api/v1/filler/run', {
  method: 'POST',
  headers: authHeaders(),   // Authorization: Bearer <token>
  body: form,
});
```

Retourne un `FillerResult` ou lève une erreur lisible.

#### `downloadFillerFile(downloadUrl, filename)`

Télécharge un fichier produit en récupérant le contenu avec authentification, puis déclenche le téléchargement navigateur via une URL objet temporaire :

```typescript
const res  = await fetch(downloadUrl, { headers: authHeaders() });
const blob = await res.blob();
const url  = URL.createObjectURL(blob);
const a    = document.createElement('a');
a.href     = url;
a.download = filename;
a.click();
URL.revokeObjectURL(url);
```

Il est nécessaire de passer par cette fonction (et non un simple `<a href>`) car la route de téléchargement est protégée par authentification.

---

### 4.3 Le composant FillerTab `frontend/src/components/FillerTab.tsx`

C'est l'interface utilisateur complète du remplissage. Il est autonome et contient tout son état local.

#### Zone de dépôt PDF

Même pattern que les autres onglets (ActeEngagementTab) : zone cliquable avec drag-and-drop, affichage du nom et de la taille du fichier sélectionné, bordure colorée selon l'état.

#### Sélecteur de type de soumissionnaire

Six boutons correspondant aux valeurs de `CompanyCase`. Le bouton actif est mis en évidence. Ce choix détermine quelle section du dossier sera extraite et remplie.

#### Champ numéros de lots

Champ texte optionnel. Si laissé vide, tous les lots détectés sont traités. Sinon, l'utilisateur saisit des numéros séparés par des virgules (`1,2`). La valeur est parsée et validée avant envoi.

#### Indicateur de progression

Pendant le traitement (30 à 90 secondes), un anneau de progression circulaire affiche le temps écoulé en secondes. L'anneau se remplit progressivement jusqu'à 90 secondes (durée estimée maximale). Un `setInterval` démarre avec le chargement et s'arrête automatiquement à la fin.

#### Cartes de téléchargement

Une fois le résultat reçu, chaque fichier produit s'affiche dans une carte `DownloadCard` indépendante avec :
- Un badge de format coloré (rouge pour PDF, bleu pour Word, vert pour Excel)
- Le nom du type de document formaté lisiblement
- Le nom du fichier produit
- Un bouton de téléchargement avec son propre état de chargement

#### Zone CTA

En bas, un bloc gradient avec le bouton principal "Lancer le remplissage". Un bouton "Nouveau" apparait une fois le traitement terminé pour réinitialiser le formulaire.

---

### 4.4 Intégration dans le panneau Outils `RightPanel.tsx`

Deux modifications dans ce fichier :

**Ajout de `'filler'` au type `Outil`**

```typescript
export type Outil = 'signatures' | 'bordereau' | 'acte' | 'filler';
```

**Ajout d'une entrée dans `OUTILS_NAV`**

```typescript
{
  id: 'filler',
  label: 'Remplissage dossier',
  desc: 'Remplissage automatique dossier AO',
  icon: '...'   // icône crayon sur document
}
```

**Rendu dans `OutilsContent`**

```typescript
{section === 'filler' && <FillerTab />}
```

Le nouvel outil apparait dans le panneau gauche de la section "Outils", en quatrième position après Documents et Signatures, Offre financière, et Acte d'engagement.

---

## 5. Cycle de vie d'une requête

Voici le déroulement complet d'une demande de remplissage, de bout en bout :

```
1. L'utilisateur sélectionne un PDF et clique sur "Lancer le remplissage"

2. FillerTab.tsx appelle runFiller(file, companyCase, lots)
   -> POST /api/v1/filler/run avec le PDF en multipart

3. filler_routes.py reçoit la requête :
   -> vérifie l'authentification JWT
   -> valide le fichier (taille, extension, non vide)
   -> vérifie que MISTRAL_API_KEY est configurée
   -> parse les numéros de lots
   -> appelle await run_filler(...)

4. filler_service.py prend le relais :
   -> génère un job_id unique (UUID hex)
   -> crée data/filler_tmp/<job_id>/input.pdf
   -> lance asyncio.to_thread(_run_pipeline, ...)

5. Dans le thread, filler_orchestrator.run() s'exécute :
   -> détecte si le PDF est scanné ou texte
   -> segmente le PDF par type de document
   -> pour chaque segment :
      - si action = "fill" : remplissage Mistral/Pixtral
      - si action = "extract_table" : extraction Excel
   -> produit les fichiers dans data/filler_tmp/<job_id>/output/

6. filler_service.py collecte les fichiers produits :
   -> pour chaque résultat, cherche le .pdf ET le .docx (même nom de base)
   -> construit les URLs de téléchargement
   -> retourne un FillerResult

7. La route retourne le FillerResult en JSON

8. FillerTab.tsx affiche les cartes de téléchargement

9. L'utilisateur clique sur "Télécharger" sur une carte :
   -> downloadFillerFile() fait un GET /api/v1/filler/download/<job_id>/<filename>
   -> avec le token JWT dans le header Authorization
   -> le navigateur déclenche le téléchargement du fichier
```

---

## 6. Stockage des fichiers temporaires

Les fichiers sont stockés dans `data/filler_tmp/` avec la structure suivante :

```
data/
  filler_tmp/
    a3f2c1d4.../          <- job_id (UUID hex, unique par requête)
      input.pdf            <- PDF uploadé par l'utilisateur
      output/
        acte_engagement_societe_lot1_filled.pdf
        acte_engagement_societe_lot1_filled.docx
        declaration_honneur_societe_filled.pdf
        declaration_honneur_societe_filled.docx
        bordereau_prix.xlsx
```

Chaque job a son propre dossier isolé. Les fichiers sont conservés pendant **1 heure** après leur création. Au-delà, la route de téléchargement retourne HTTP 404.

La fonction `cleanup_job(job_id)` supprime un dossier de job avec `shutil.rmtree`. Elle peut être appelée manuellement ou branchée sur un scheduler si nécessaire.

> **Note :** Le dossier `data/filler_tmp/` est créé automatiquement au premier traitement. Il n'est pas nécessaire de le créer manuellement.
