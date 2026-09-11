## Références de chemin à réécrire

Liste exhaustive, établie par lecture réelle des fichiers le 2026-09-10. À traiter dans
cet ordre. Tous les chemins compose sont relatifs à `adjuja-infra/`, exactement comme
`e-himaya-parent/docker-compose.yml` utilise `context: ../cop-api`.

Bonne nouvelle de la découpe en dépôts : `.github/workflows/tests.yml` et
`.pre-commit-config.yaml` atterrissent à la racine de `adjuja-backend`, donc leurs chemins
(`app/`, `tests/`, `requirements.txt`) redeviennent justes **sans aucune modification**.
C'est le seul endroit où le multi-dépôts fait moins de travail que le mono-dépôt.

### 1. `adjuja-infra/docker-compose.yml`

| Ligne (avant découpe) | Avant | Après |
|---|---|---|
| 74, 116, 162, 203 (`api`, `celery-io`, `celery-cpu`, `celery-beat`) | `context: .` | `context: ../adjuja-backend` |
| 236 (`frontend`) | `context: ./frontend` | `context: ../adjuja-frontend` |
| 253, 284, 318 (`ao-watcher-*`) | `context: ./ao-watcher` | `context: ../adjuja-watcher` |
| 336, 361, 387 (`notification-*`) | `context: ./notification-service` | `context: ../adjuja-notification` |
| 60 (`qdrant`) | `./data/qdrant` | **inchangé** -- `data/` part dans `adjuja-infra/`, le chemin relatif reste juste |
| `env_file: - .env` | | **inchangé** -- `.env` part aussi dans `adjuja-infra/` |

Les **noms de services** (`ao-watcher-api`, `notification-api`…) ne changent pas : ce sont
des noms DNS internes utilisés par `settings.NOTIFICATION_SERVICE_URL` et par le frontend.
Les renommer serait un changement de comportement, pas une réorganisation.

### 2. `adjuja-infra/docker-compose.dev.yml`

Mêmes réécritures de `context:`, plus les montages de code à chaud :

| Avant | Après |
|---|---|
| `- ./app:/app/app` (4×: `api`, `celery-io`, `celery-cpu`, `celery-beat`) | `- ../adjuja-backend/app:/app/app` |
| `- ./ao-watcher/app:/app/app` (3×) | `- ../adjuja-watcher/app:/app/app` |
| `- ./ao-watcher/scrapers:/app/scrapers` (3×) | `- ../adjuja-watcher/scrapers:/app/scrapers` |
| `- ./data/qdrant:/qdrant/storage` | **inchangé** |
| bloc `frontend` commenté (l. 87-89) | mettre à jour aussi, sinon il pourrit |

### 3. `adjuja-backend/Dockerfile`

Supprimer l'étape `frontend-builder` (l. 1-13) et le
`COPY --from=frontend-builder /frontend/dist ./frontend/dist/` de l'étape `final`
(décision 3 de `repos.md`). Le reste (`COPY app/`, `COPY company_defaults.json`,
`COPY alembic/`, `COPY alembic.ini`) est déjà relatif au contexte et ne bouge pas.

`ao-watcher/Dockerfile`, `notification-service/Dockerfile` et `frontend/Dockerfile` font
tous `COPY . .` relatif à leur propre contexte : **rien à changer** dedans.

### 4. Les `.gitignore`, un par dépôt

Le `.gitignore` racine actuel couvre tous les services d'un coup. Il éclate :

- **`adjuja-backend/.gitignore`** : `__pycache__/`, `*.py[cod]`, `.venv/`, `venv/`,
  `.env`, `.pytest_cache/`, `.coverage`, plus `seed_company_profile.py` (aujourd'hui
  ignoré à la racine, devient `adjuja-backend/seed_company_profile.py`).
- **`adjuja-frontend/.gitignore`** : `node_modules/`, `dist/` (aujourd'hui
  `frontend/node_modules/`, `frontend/dist/` -- le préfixe saute).
- **`adjuja-watcher/.gitignore`**, **`adjuja-notification/.gitignore`** : le bloc Python.
- **`adjuja-infra/.gitignore`** : `.env`, `data/`, `certbot/` (contenu réel, garder les
  `.gitkeep`), `*.log`.
- **`adjuja-docs/.gitignore`** : `conception/5. Presentation/old/`, le bloc
  `hafid-taches-docs/**` avec ses 4 exceptions `!`, `Dossier AO HAFID/`.

Les lignes `worker/` et `rd/` disparaissent des `.gitignore` : ces dossiers restent à la
racine du dossier de travail, qui n'est plus un dépôt -- plus rien ne les suit, donc plus
rien à ignorer.

### 5. `adjuja-backend/ingest_knowledge_base.py`

Trois chemins de documents source codés en dur (l. 109, 114, 119) pointant vers
`hafid-taches-docs/chatbot/…`, dossier qui part dans le dépôt `adjuja-docs`. Le script
tournant depuis `adjuja-backend/`, ils deviennent
`../adjuja-docs/hafid-taches-docs/chatbot/…`.

**Attention** : ce chemin ne tient que si les deux dépôts sont clonés côte à côte, ce que
`clone.sh` garantit mais qu'un clone isolé de `adjuja-backend` ne garantit pas. Le script
doit échouer avec un message clair ("dépôt adjuja-docs introuvable, lancer clone.sh")
plutôt que par un `FileNotFoundError` nu.

La commande de sa docstring (`docker compose exec api python ingest_knowledge_base.py`)
est à corriger : le fichier compose n'est plus à la racine, et le script n'est pas copié
dans l'image (le Dockerfile ne copie que `app/`, `company_defaults.json`, `alembic/`).

### 6. `adjuja-infra/scripts/clone.sh`

Nouveau fichier, calqué sur `e-himaya-parent/scripts/clone.sh` : résout le dossier de
travail comme le parent de `adjuja-infra`, itère sur une table
`nom_distant → dossier_local`, clone si absent et `git pull --rebase` sinon. Adapter :
GitHub et non GitLab, branche par défaut `main` et non `develop`, et retirer le bloc
`ssh-agent`/`ssh-add ~/.ssh/id_ed25519` s'il ne correspond pas à la config réelle de la
machine (à vérifier, ne pas recopier tel quel).

### 7. Documentation à mettre à jour (obligatoire, cf. `ai-workflow-rules.md`)

- `adjuja-infra/README.md` -- **nouveau point d'entrée du projet** : arborescence du
  workspace, `clone.sh`, commandes de lancement.
- `README.md` actuel -- éclaté : la partie backend part dans `adjuja-backend/README.md`,
  le reste dans `adjuja-infra/README.md`.
- `CLAUDE.md` -- sections "Lancer l'application" et "Tests" (les commandes changent de
  répertoire), et les chemins des conventions (`frontend/src/api.ts` →
  `adjuja-frontend/src/api.ts`).
- `context/architecture-context.md` -- limites de service, topologie des dépôts.
- `context/code-standards.md` -- chemins cités dans les conventions.
- `conception/2. Architecture/architecture.md` -- arborescence complète.
- `context/progress-tracker.md` -- section Complété.

### 8. Ce qu'il ne faut surtout PAS renommer

Vérifié par grep sur `app/`, `frontend/src/`, `ao-watcher/app/`,
`notification-service/app/` : les seules occurrences de `ao-watcher`,
`notification-service` et `hafid-taches-docs` dans le code sont des commentaires, des
messages de log, des noms de service DNS et des tags OpenAPI -- **aucun chemin de
fichier**. Deux pièges en particulier :

- `ao-watcher/app/workers/tasks/download_tasks.py:104,118` :
  `minio_key = f"ao-watcher/{ao_id}/…"` est un **préfixe de clé d'objet MinIO**, pas un
  chemin disque. Le renommer rendrait inaccessibles tous les documents déjà stockés en
  prod. Ne pas y toucher.
- `app/config/settings.py:245,250` : `notification-service` y désigne le nom du service
  Docker/DNS. Inchangé.

Un `sed` global sur `ao-watcher` ou `notification-service` casserait la prod. La
réécriture se fait fichier par fichier, dans la liste ci-dessus, jamais par
recherche-remplacement en masse.
