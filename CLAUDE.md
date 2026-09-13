# ADJUJA Instructions pour Claude Code

## Début de session

OBLIGATOIRE, première action de toute session, avant toute autre chose :

1. Lire `context/progress-tracker.md` pour connaître l'état réel du projet (ce qui est
   fait, en cours, en question) -- jamais l'état supposé/attendu.
2. Lire ceux des fichiers suivants pertinents pour la tâche en cours :
   `context/project-overview.md` (portée produit), `context/architecture-context.md`
   (stack, limites de service, invariants), `context/code-standards.md` (conventions),
   `context/ui-context.md` (design), `context/ai-workflow-rules.md` (discipline de
   travail), `context/bugs-connus.md` (défauts réels de l'application, à l'état réel).

Ne pas dupliquer leur contenu ici -- les relire à chaque session, ils évoluent avec le
projet et une copie figée dans ce fichier finirait par dériver.

Une feature en cours de construction vit dans `context/feature-spec/<nom>/` (voir
`context/ai-workflow-rules.md` pour le format) -- la lire avant de continuer un travail
déjà commencé.

## Agents

Ne jamais utiliser l'outil Agent (subagents) sur ce projet, quelle que soit la tâche.
Tout le travail se fait directement dans la session courante.

## Structure du workspace

Depuis le 2026-09-12, ADJUJA est **de nouveau un dépôt unique**, à la racine de ce
dossier. La découpe en dépôts par service du 2026-09-10 est annulée : cinq des six
dépôts n'avaient aucun remote, leur code n'a donc jamais été poussé, et le dépôt
racine les enregistrait en gitlinks vers des dépôts inexistants sur GitHub.
L'organisation en dossiers par service, elle, reste inchangée.

```
Adjuja/                   # LE dépôt git (remote : Ahmed123359/Adjuja.git)
  adjuja-backend/         # dépôt — FastAPI, Celery, Alembic, tests, CI (port 8000)
  adjuja-frontend/        # dépôt — React / Vite / nginx (5173 dev, 8090 prod)
  adjuja-watcher/         # dépôt — veille AO, ex ao-watcher/ (port 8001)
  adjuja-notification/    # dépôt — notifications (port 8002)
  adjuja-infra/           # dépôt — compose, .env, certbot, scripts/clone.sh
  adjuja-docs/            # dépôt — conception/, business_plan/, hafid-taches-docs/
  CLAUDE.md, context/     # ce fichier et les specs : NON VERSIONNÉS, à la racine
  worker/, rd/            # R&D local, hors dépôts (worker/ est du code mort)
```

Conséquences pratiques :

- **Un changement transverse tient en un seul commit.** Les commandes git se lancent
  depuis la racine, jamais depuis un sous-dossier de service.
- Les chemins de build compose sont relatifs à `adjuja-infra/`
  (`context: ../adjuja-backend`), donc les dossiers **doivent rester frères**.
- `CLAUDE.md` et `context/` sont de nouveau versionnés (ils ne l'étaient plus entre
  le 2026-09-10 et le 2026-09-12, sans aucune sauvegarde).
- La clé SSH de ce dépôt est `~/.ssh/id_ed25519_continuium`, posée en
  `core.sshcommand` local. C'est la seule qui authentifie le compte GitHub du
  projet : les autres clés de la machine sont refusées.
- Ne **jamais** versionner `Dossier AO HAFID/` : dossiers d'appels d'offres réels
  avec CV, diplômes et pièces signées de personnes nommées. Exclu par `.gitignore`.
- Historique de la découpe puis de son annulation :
  `context/feature-spec/separation-depots/`. État d'avant la découpe : tag
  `pre-split-2026-09-10`.

## Lancer l'application

Toutes les commandes Docker se lancent depuis `adjuja-infra/`.

```bash
cd adjuja-infra

# Développement (hot-reload back + front)
docker compose -f docker-compose.dev.yml up

# Production
docker compose up
```

Sans Docker :

```bash
cd adjuja-backend
cp ../adjuja-infra/.env .env         # settings.py lit un .env relatif au cwd
uvicorn app.main:app --reload        # backend (port 8000)

cd adjuja-frontend && npm run dev     # frontend (port 5173)
```

## Tests

Depuis `adjuja-backend/` :

```bash
pytest                  # tous les tests
pytest tests/unit/      # unitaires seulement
pytest --cov=app        # avec couverture
```

## Conventions backend (Python)

- Type hints obligatoires sur toutes les fonctions
- Les routes FastAPI ne contiennent pas de logique métier uniquement validation + appel service + gestion HTTP
- Toute route protégée doit avoir `Depends(get_current_user)`
- Nouveaux services → singleton via `@lru_cache` dans `dependencies.py`
- Ne jamais modifier le schéma PostgreSQL sans en discuter d'abord (migration Alembic requise)

## Conventions frontend (TypeScript/React)

Depuis le 2026-09-12, le frontend est organisé **par domaine métier** (voir
`context/feature-spec/refactoring-frontend/`) :

```
adjuja-frontend/src/
  features/<domaine>/   api.ts, types.ts, components/, la page du domaine
                        ao, veille, company, billing, auth, org, tools, chat,
                        generation, marches, notifications, landing, legal
  shared/lib/http.ts    socle HTTP : jeton, authHeaders(), helpers de réponse
  shared/layout/        coquille applicative (RightPanel, LeftPanel, Header...)
  shared/ui/            composants transverses (CustomSelect, GlowMenu...)
  api.ts, types.ts      barrels de rétrocompatibilité, ne rien y ajouter
  pages/                seulement les pages sans domaine (404, ComingSoon)
```

`src/components/` n'existe plus. Un nouvel écran va dans `features/<domaine>/`,
jamais dans `pages/` ni dans un `components/` à la racine.

- Ne jamais appeler le backend directement depuis un composant : tout appel passe
  par le `api.ts` du domaine, qui utilise `authHeaders()` de `shared/lib/http.ts`
- Code nouveau : importer le domaine directement
  (`import { fetchAoSteps } from "../features/ao/api"`), pas le barrel racine
- `src/api.ts` et `src/types.ts` ne sont plus que des ré-exports pour ne pas casser
  les imports existants. **Ne rien y ajouter de neuf**, ils se vident au fil des
  migrations d'imports

## Règles générales

- **Un bug trouvé est déclaré puis corrigé.** À tout moment, si un défaut ou une
  incohérence de logique est découvert -- y compris en travaillant sur un sujet sans
  rapport -- le déclarer dans `context/bugs-connus.md`, puis le corriger dans la
  foulée ou juste après la tâche en cours. La correction n'est repoussée que si elle
  demande un arbitrage produit, ou si elle touche du code de production plus risqué
  que le bug lui-même : la raison est alors écrite dans le registre. Ne jamais
  terminer un échange en laissant un bug seulement mentionné à l'oral.
  Détail de la règle : `context/ai-workflow-rules.md`.
- Ne jamais commiter les clés API (`.env` est gitignore)
- Toujours proposer un plan avant de modifier un service existant
- Mettre à jour `adjuja-docs/conception/1.Roadmap/roadmap_technique.md` quand un item est terminé (`[ ]` → `[x]`)
- Mettre à jour `adjuja-docs/conception/2. Architecture/architecture.md` si l'architecture change
- **Mettre à jour `context/progress-tracker.md` dès qu'un changement significatif est fait** (pas seulement en fin de session) : section Complété, En cours, Questions ouvertes. `SUIVI.md` est obsolète, remplacé par ce fichier (2026-07-18).

## Sécurité

- JWT_SECRET_KEY doit être ≥ 32 chars et différente de "change-me" en prod
- Ne jamais désactiver l'auth sur une route qui était protégée
- Valider les fichiers uploadés (taille max, type MIME) avant traitement
