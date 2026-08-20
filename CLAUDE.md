# ADJUJA Instructions pour Claude Code

## Début de session

OBLIGATOIRE, première action de toute session, avant toute autre chose :

1. Lire `context/progress-tracker.md` pour connaître l'état réel du projet (ce qui est
   fait, en cours, en question) -- jamais l'état supposé/attendu.
2. Lire ceux des fichiers suivants pertinents pour la tâche en cours :
   `context/project-overview.md` (portée produit), `context/architecture-context.md`
   (stack, limites de service, invariants), `context/code-standards.md` (conventions),
   `context/ui-context.md` (design), `context/ai-workflow-rules.md` (discipline de
   travail).

Ne pas dupliquer leur contenu ici -- les relire à chaque session, ils évoluent avec le
projet et une copie figée dans ce fichier finirait par dériver.

Une feature en cours de construction vit dans `context/feature-spec/<nom>/` (voir
`context/ai-workflow-rules.md` pour le format) -- la lire avant de continuer un travail
déjà commencé.

## Agents

Ne jamais utiliser l'outil Agent (subagents) sur ce projet, quelle que soit la tâche.
Tout le travail se fait directement dans la session courante.

## Lancer l'application

```bash
# Développement (hot-reload back + front)
docker compose -f docker-compose.dev.yml up

# Production
docker compose up

# Sans Docker
uvicorn app.main:app --reload        # backend (port 8000)
cd frontend && npm run dev            # frontend (port 5173)
```

## Tests

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

- Tous les appels API passent par `frontend/src/api.ts` avec `authHeaders()`
- Ne jamais appeler le backend directement depuis un composant
- Types dans `frontend/src/types.ts`

## Règles générales

- Ne jamais commiter les clés API (`.env` est gitignore)
- Toujours proposer un plan avant de modifier un service existant
- Mettre à jour `conception/1.Roadmap/roadmap_technique.md` quand un item est terminé (`[ ]` → `[x]`)
- Mettre à jour `conception/2. Architecture/architecture.md` si l'architecture change
- **Mettre à jour `context/progress-tracker.md` dès qu'un changement significatif est fait** (pas seulement en fin de session) : section Complété, En cours, Questions ouvertes. `SUIVI.md` est obsolète, remplacé par ce fichier (2026-07-18).

## Sécurité

- JWT_SECRET_KEY doit être ≥ 32 chars et différente de "change-me" en prod
- Ne jamais désactiver l'auth sur une route qui était protégée
- Valider les fichiers uploadés (taille max, type MIME) avant traitement
