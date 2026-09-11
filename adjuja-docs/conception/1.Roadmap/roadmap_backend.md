# OffrIA Roadmap backend

Correctifs et améliorations identifiés directement dans le code.

> **Légende**
> `[PROD]` = obligatoire avant tout déploiement, même pour 5-10 utilisateurs
> `[SCALE]` = utile à partir de ~50+ utilisateurs simultanés ou en multi-réplica

---

## Bugs et correctifs

- [x] `[PROD]` **`asyncio.gather` sans isolation des erreurs** (`generation_service.py:95`)
      Si une des 8 sections échoue, toutes les autres sont annulées.
      Correction : `asyncio.gather(*tasks, return_exceptions=True)` → résultat partiel au lieu d'une perte totale.

- [x] `[PROD]` **Pas de timeout sur les appels LLM** (`generation_service.py`)
      Si un provider ne répond pas, le worker FastAPI reste bloqué indéfiniment.
      Correction : `asyncio.wait_for(..., timeout=60)` autour de chaque appel.

- [x] `[PROD]` **CORS vide en production** (`main.py:28`)
      `allow_origins=[]` bloque toutes les requêtes cross-origin le frontend ne peut pas appeler l'API.
      Correction : variable d'env `ALLOWED_ORIGINS=https://ton-domaine.com` lue dans `main.py`.

- [x] `[PROD]` **Détails d'erreur exposés au client** (`generation_routes.py:98`)
      `detail=f"Erreur interne : {str(e)}"` renvoie les messages d'exception bruts en HTTP 500.
      Correction : logger l'erreur côté serveur, retourner `"Une erreur interne est survenue."` au client.

- [ ] `[SCALE]` **`UsageService.add()` sans verrou** (`usage_service.py:16`)
      `self._tokens += tokens` n'est pas atomique. Sous forte charge concurrente, les compteurs dérivent.
      Correction : ajouter un `threading.Lock` (impact négligeable à 5-10 users, réel à 50+).

- [ ] `[SCALE]` **`_load_defaults()` appelé à chaque requête** (`generation_routes.py:49`)
      Lit `company_defaults.json` depuis le disque à chaque `POST /generate`.
      Correction : `@lru_cache` ou chargement au démarrage via `lifespan`.

- [ ] `[SCALE]` **SQLite bloque la boucle asyncio** (`history_service.py`, `user_service.py`)
      Les appels `sqlite3` sont synchrones et bloquent l'event loop de FastAPI.
      Invisible à 5-10 users (requêtes rares). Critique au-delà : migrer vers `aiosqlite` ou `asyncpg`.

- [ ] `[SCALE]` **Provider LLM réinstancié à chaque requête** (`generation_service.py:127`)
      Crée un nouveau client HTTP à chaque appel. Acceptable à faible charge.
      Correction à 50+ : cache par couple `(provider, model)` pour réutiliser les connexions HTTP.

---

## Observabilité

- [x] `[PROD]` **Logging structuré** Zéro log dans le code actuel.
      Sans logs, impossible de diagnostiquer un problème en production.
      Ajouter `logging` stdlib sur : erreurs avec stacktrace, durée des appels LLM, 401/500.

- [x] `[PROD]` **Healthcheck enrichi** (`main.py:50`)
      `/health` retourne juste `{"status": "ok"}` sans vérifier quoi que ce soit.
      Ajouter : ping SQLite, présence des clés API, statut Qdrant optionnel.
      Indispensable pour que Docker/load balancer détecte une instance morte.

---

## Qualité et robustesse

- [x] `[PROD]` **Validation de longueur de l'`ao_texte`** (`models/generation.py`)
      Sans limite, un utilisateur peut envoyer 500 000 caractères → tokens massifs + mémoire saturée.
      Correction : `max_length=50_000` dans le modèle Pydantic `GenerationRequest`.

- [ ] `[SCALE]` **Tests pour les nouveaux services** (`tests/`)
      `UserService`, `HistoryService` (SQLite) et `auth_routes.py` n'ont aucun test.
      Ajouter tests unitaires (`:memory:` SQLite) + tests d'intégration `TestClient`.

---

## Performance

- [ ] `[SCALE]` **Connexion SQLite ouverte/fermée à chaque opération**
      Chaque méthode appelle `_connect()`. Acceptable à faible charge.
      Correction à 50+ : connexion persistante par service ou pool.

- [ ] `[SCALE]` **Mise en cache des listes de modèles** (`models_routes.py`)
      La liste est reconstruite à chaque `GET /api/v1/models`.
      Correction : vérifier que `@lru_cache` est actif sur le provider factory.
