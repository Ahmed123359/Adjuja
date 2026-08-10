# OffrIA Instructions pour Claude Code

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
- Ne jamais modifier le schéma SQLite sans en discuter d'abord (migration manuelle requise)

## Conventions frontend (TypeScript/React)

- Tous les appels API passent par `frontend/src/api.ts` avec `authHeaders()`
- Ne jamais appeler le backend directement depuis un composant
- Types dans `frontend/src/types.ts`

## Règles générales

- Ne jamais commiter les clés API (`.env` est gitignore)
- Toujours proposer un plan avant de modifier un service existant
- Mettre à jour `conception/1.Roadmap/roadmap_technique.md` quand un item est terminé (`[ ]` → `[x]`)
- Mettre à jour `conception/2. Architecture/architecture.md` si l'architecture change
- **Lire `context/ai-workflow-rules.md` et `context/progress-tracker.md` en début de session** : discipline de travail (vérifier en réel, pas supposer) et état vivant du projet. `SUIVI.md` est obsolète, remplacé par ces deux fichiers (2026-07-18).
- **Mettre à jour `context/progress-tracker.md` dès qu'un changement significatif est fait** (pas seulement en fin de session) : section Complété, En cours, Questions ouvertes

## Sécurité

- JWT_SECRET_KEY doit être ≥ 32 chars et différente de "change-me" en prod
- Ne jamais désactiver l'auth sur une route qui était protégée
- Valider les fichiers uploadés (taille max, type MIME) avant traitement
