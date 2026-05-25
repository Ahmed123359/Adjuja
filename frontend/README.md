# OffrIA Frontend

Interface web de l'application **OffrIA**, un générateur de réponses à appels d'offres propulsé par des LLMs (Claude, GPT-4, Mistral).

---

## Stack technique

| Technologie            | Version | Rôle                                    |
| ---------------------- | ------- | --------------------------------------- |
| React                  | 18.3    | Framework UI                            |
| TypeScript             | 5.6     | Typage statique                         |
| Vite                   | 5.4     | Build tool & dev server                 |
| Tailwind CSS           | 3.4     | Styles utilitaires                      |
| marked                 | 9.1     | Rendu Markdown → HTML                   |
| xlsx                   | 0.18    | Import/export Excel (profil entreprise) |
| PostCSS + Autoprefixer |         | Pipeline CSS                            |

---

## Structure du projet

```
frontend/
├── index.html               # Entrée HTML (anti-flash theme script)
├── vite.config.ts           # Config Vite (proxy API, build output)
├── tailwind.config.js       # Palette navy/indigo, shadows, fonts
├── tsconfig.json            # TS strict, target ES2022, jsx react-jsx
├── package.json
└── src/
    ├── main.tsx             # Point d'entrée React 18 (createRoot)
    ├── index.css            # Variables CSS, utilitaires globaux
    ├── types.ts             # Interfaces TypeScript du domaine
    ├── api.ts               # Couche fetch vers le backend FastAPI
    ├── App.tsx              # Root : state global, routing d'états
    ├── pages/
    │   ├── LoginPage.tsx    # Formulaire de connexion
    │   └── RegisterPage.tsx # Formulaire d'inscription
    └── components/
        ├── Header.tsx       # Barre supérieure (logo, usage, RAG, thème, user)
        ├── LeftPanel.tsx    # Sidebar formulaire (AO, LLM, profil, params)
        └── RightPanel.tsx   # Zone principale (dashboard, loading, résultat, brief)
```

---

## Architecture de l'état

Tout l'état applicatif est géré dans `App.tsx` via `useState` / `useCallback`. Il n'y a pas de Context ni de store externe.

```
App (state owner)
├── isDark           thème clair/sombre, persisté en localStorage
├── aoText           texte de l'appel d'offres
├── provider         fournisseur LLM sélectionné
├── model            modèle sélectionné
├── company          profil entreprise (CompanyData)
├── temperature      créativité (0.0 → 1.0)
├── maxTokens        tokens max par section
├── instructions     instructions supplémentaires
├── langue           'fr' | 'en'
├── appState         'idle' | 'loading' | 'result' | 'error'
├── result           GenerationResult | null
├── ragStatus        RagStatus | null
└── usage            UsageData | null
```

---

## Design system

### Palette de couleurs

| Rôle                  | Classe / Valeur            |
| --------------------- | -------------------------- |
| Fond principal dark   | `navy-900` → `#0B1220`     |
| Surface carte dark    | `navy-800` → `#0F1929`     |
| Accent principal      | `indigo` → `#6366F1`       |
| Accent hover          | `indigo-light` → `#818CF8` |
| Texte primaire dark   | `slate-100` / `slate-200`  |
| Texte secondaire dark | `slate-400` / `slate-500`  |
| Fond principal light  | `slate-100`                |
| Surface carte light   | `white`                    |

### Typographie

| Usage            | Famille           | Poids   |
| ---------------- | ----------------- | ------- |
| Titres / display | Space Grotesk     | 600–800 |
| Corps / labels   | Inter             | 400–600 |
| Document Word    | Calibri, Segoe UI |         |

### Utilitaires CSS custom (`index.css`)

| Classe           | Description                                |
| ---------------- | ------------------------------------------ |
| `.glass-panel`   | Carte translucide avec blur (light + dark) |
| `.text-gradient` | Gradient indigo sur texte                  |
| `.field`         | Input focus ring indigo                    |
| `.sidebar-label` | Label section 10px uppercase tracking      |
| `.word-body`     | Typographie du document Word généré        |

### Thème clair/sombre

Géré via `darkMode: 'class'` dans Tailwind. La classe `.dark` est appliquée sur `<html>` par `App.tsx`. Le thème par défaut est **sombre**, persisté dans `localStorage` (`theme: 'dark' | 'light'`). Un script inline dans `index.html` applique la classe avant le premier rendu pour éviter le flash.

---

## Composants

### `Header.tsx`

- Logo **OffrIA** avec badge indigo gradient
- Compteur d'usage (tokens / appels) avec barres de progression
- Bouton RAG : statut + déclencheur de réindexation ETL
- Indicateur de statut API (connecté / hors ligne / connexion)
- Bouton bascule de thème ☀ / ☾

### `LeftPanel.tsx`

- **Section AO** : zone de dépôt de fichier (drag & drop, .txt / .pdf / .doc) ou saisie libre
- **Section LLM** : sélection du fournisseur (Anthropic / OpenAI / Mistral) + modèle
- **Profil entreprise** : 4 accordéons (Identité & Légal, Contact, Activité, Capacités), import/export Excel
- **Paramètres** : langue FR/EN, instructions libres, slider créativité, tokens/section
- **Bouton Générer** : `bg-indigo-600`, désactivé si validation échoue ou limite atteinte. Raccourci `⌘ Entrée`.

### `RightPanel.tsx`

| État      | Affichage                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------- |
| `idle`    | **Dashboard** : titre, 3 stat-cards (appels, tokens, RAG), CTA gradient indigo, guide 4 étapes |
| `loading` | Spinner à anneaux concentriques indigo + étapes en cours                                       |
| `result`  | Toolbar + onglets **Document** / **Brief stratégique** + export Word/PDF                       |
| `error`   | Carte d'erreur avec icône                                                                      |

---

## Couche API (`api.ts`)

Toutes les requêtes ciblent le backend FastAPI proxifié via Vite.

| Fonction                 | Méthode | Endpoint                | Auth |
| ------------------------ | ------- | ----------------------- | ---- |
| `register(params)`       | POST    | `/api/v1/auth/register` |      |
| `login(email, pwd)`      | POST    | `/api/v1/auth/login`    |      |
| `getMe()`                | GET     | `/api/v1/auth/me`       | ✓    |
| `fetchModels()`          | GET     | `/api/v1/models`        |      |
| `fetchDefaults()`        | GET     | `/api/v1/defaults`      |      |
| `fetchRagStatus()`       | GET     | `/api/v1/rag/status`    |      |
| `reindexRag()`           | POST    | `/api/v1/rag/index`     |      |
| `fetchUsage()`           | GET     | `/api/v1/usage`         | ✓    |
| `resetUsage()`           | POST    | `/api/v1/usage/reset`   | ✓    |
| `extractPdfText(file)`   | POST    | `/api/v1/pdf/extract`   | ✓    |
| `generate(params)`       | POST    | `/api/v1/generate`      | ✓    |
| `fetchHistory()`         | GET     | `/api/v1/history`       | ✓    |
| `fetchHistoryEntry(id)`  | GET     | `/api/v1/history/{id}`  | ✓    |
| `deleteHistoryEntry(id)` | DELETE  | `/api/v1/history/{id}`  | ✓    |
| `clearHistory()`         | DELETE  | `/api/v1/history`       | ✓    |

---

## Types TypeScript (`types.ts`)

```typescript
CompanyData; // Profil entreprise (18 champs)
Model; // { provider, model_id, description, defaut }
GenerationResult; // { texte_complet, sections[], tokens_utilises, brief_strategique, ... }
RagStatus; // { ready, chunk_count, doc_count, etl_available }
UsageData; // { total_tokens, total_appels, max_tokens_cumul, max_appels }
AppState; // 'idle' | 'loading' | 'result' | 'error'
AppDefaults; // Valeurs par défaut chargées au démarrage
User; // { id, nom, prenom, email, created_at }
HistorySummary; // Entrée d'historique sans le résultat complet
HistoryEntry; // Entrée d'historique avec GenerationResult
PdfExtractResult; // { text, method, pages, is_scanned }
```

---

## Configuration Vite

```typescript
// vite.config.ts
base: process.env.NODE_ENV === 'production' ? '/ui/' : '/'

proxy: {
  '/api':    → http://localhost:8000   (ou VITE_API_TARGET)
  '/health': → http://localhost:8000
}

build.outDir: 'dist'
```

La variable d'environnement `VITE_API_TARGET` permet de pointer vers un backend distant en développement :

```bash
VITE_API_TARGET=http://mon-serveur:8000 npm run dev
```

---

## Commandes

```bash
# Installer les dépendances
npm install

# Lancer en développement (hot-reload, proxy API)
npm run dev
# → http://localhost:5173

# Vérifier les types + build de production
npm run build
# → dist/

# Prévisualiser le build de production
npm run preview
```

---

## Notes de configuration TypeScript

```json
{
  "target": "ES2022",
  "jsx": "react-jsx", // Automatic JSX transform (pas d'import React)
  "strict": true,
  "skipLibCheck": true, // Évite les faux positifs sur les types tiers
  "moduleResolution": "bundler"
}
```

> **Note VS Code** : Les erreurs 2875/7026 (`JSX element implicitly has type 'any'`) visibles dans l'éditeur sont des artefacts du serveur TypeScript en cache. `tsc && vite build` compile sans erreur. Solution : `Ctrl+Shift+P` → _TypeScript: Restart TS Server_.
