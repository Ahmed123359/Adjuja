# adjuja-docs

Documentation projet ADJUJA : roadmap, architecture, business plan, documents de
conception et d'avancement. Aucun code exécutable.

Ce dépôt est un morceau du workspace ADJUJA. Le point d'entrée technique du projet est
**`adjuja-infra/README.md`**.

## Contenu

- `conception/` — roadmap technique, architecture, qualité de génération, présentations,
  audits (sécurité, performance)
- `business_plan/` — offres et coûts, positionnement
- `hafid-taches-docs/` — architectures détaillées par module (technical-offer, scraping,
  notification, documents-filler) et documents de travail internes

## Place dans le workspace

Ce dépôt doit être cloné **frère** des autres : `adjuja-backend/ingest_knowledge_base.py`
lit ses documents source dans `../adjuja-docs/hafid-taches-docs/chatbot/`.
