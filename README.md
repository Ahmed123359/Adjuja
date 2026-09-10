# adjuja-backend

API principale ADJUJA : FastAPI (port 8000), workers Celery (IO et CPU), migrations
Alembic, pipeline de génération d'offres, RAG Qdrant.

Ce dépôt est un morceau du workspace ADJUJA. La vue d'ensemble (architecture, stack,
schéma de base, flux pipeline, configuration) vit dans **`adjuja-infra/README.md`**, qui
est le point d'entrée du projet.

## Place dans le workspace

Ce dépôt doit être cloné **frère** des autres (`adjuja-infra/scripts/clone.sh` s'en
charge) : les fichiers compose de `adjuja-infra` buildent avec `context: ../adjuja-backend`,
et `ingest_knowledge_base.py` lit ses documents source dans `../adjuja-docs/`.

## Lancer

Le plus simple passe par le compose de `adjuja-infra` :

```bash
cd ../adjuja-infra
docker compose -f docker-compose.dev.yml up
```

Sans Docker, depuis ce dépôt :

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../adjuja-infra/.env .env      # app/config/settings.py lit un .env relatif au cwd
uvicorn app.main:app --reload
```

Le `.env` de référence vit dans `adjuja-infra/` parce que c'est là que l'interpolation
Docker Compose (`${POSTGRES_PASSWORD}`) va le chercher. La copie locale ici n'existe que
pour l'exécution hors Docker, et elle est gitignorée.

## Tests

```bash
pytest                  # tous les tests
pytest tests/unit/      # unitaires seulement (sans Docker ni clé API)
pytest --cov=app        # avec couverture
```

## Migrations

```bash
alembic upgrade head
alembic revision --autogenerate -m "description"
```

## Note sur `/ui`

Ce dépôt ne construit plus le frontend. Jusqu'à la séparation en dépôts (2026-09-10), le
`Dockerfile` avait une étape `frontend-builder` qui buildait React et le montait sur
`/ui` — impossible à conserver une fois le frontend dans son propre dépôt. L'UI est
servie par le container `frontend` (nginx, port 8090). Le montage dans `app/main.py`
étant conditionnel, l'API démarre normalement sans ce dossier.
