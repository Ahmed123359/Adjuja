## Deliverable

ADJUJA passe d'un dépôt unique dont la racine *est* le backend (`app/`, `alembic/`,
`tests/`, `Dockerfile`, `requirements.txt` au premier niveau, mélangés aux autres
services et aux documents produit) au modèle de `e-himaya` : **un dépôt git par
service**, clonés côte à côte dans un dossier de travail qui n'est lui-même pas un
dépôt, plus un dépôt d'orchestration qui tient le compose, nginx et les scripts.

```
Adjuja/                       ← simple dossier de travail, PAS un dépôt git
├── adjuja-backend/           dépôt — FastAPI + Celery + Alembic + tests
├── adjuja-frontend/          dépôt — React / Vite / nginx
├── adjuja-watcher/           dépôt — veille AO (ex ao-watcher/)
├── adjuja-notification/      dépôt — service de notifications
├── adjuja-infra/             dépôt — compose, .env, certbot, nginx, scripts/clone.sh
└── adjuja-docs/              dépôt — conception/, business_plan/, context/
```

Correspondance avec la référence `e-himaya` : `adjuja-infra` joue le rôle de
`e-himaya-parent` (orchestration), `adjuja-docs` celui de `cop-documentation`.

Aucun changement de comportement produit. Après la découpe,
`docker compose -f adjuja-infra/docker-compose.dev.yml up` doit démarrer exactement les
mêmes containers qu'aujourd'hui, et `pytest` depuis `adjuja-backend/` doit passer à
l'identique.

## Ce que ça change vraiment (à lire avant de commencer)

Ce n'est pas un déplacement de dossiers, c'est une découpe d'historique git et la
création de dépôts distants. Trois conséquences irréversibles, toutes tranchées dans
`repos.md` avant la moindre commande :

1. **Le `.git` actuel** (remote `hafidlaadimi/technical-offer`, branche `main`) ne peut
   pas rester à la racine : la racine devient un dossier nu. Il devient le dépôt de
   `adjuja-backend` ou il est archivé -- décision dans `repos.md`.
2. **Six dépôts distants** doivent exister côté GitHub avant de pouvoir pousser. Ils
   n'existent pas aujourd'hui.
3. **L'historique** de chaque service est soit extrait du dépôt actuel
   (`git filter-repo`, conserve les commits du service), soit reparti de zéro (un commit
   initial, historique perdu). Décision dans `repos.md`.

## Depends on

Rien de nouveau côté produit. Aucune migration Alembic, aucune table, aucun endpoint,
aucun composant React touché. C'est une découpe de dépôts plus la réécriture de toutes
les références de chemin qui en découlent (`wiring.md`).

## Constat de départ (vérifié le 2026-09-10, pas supposé)

- **Le backend est la racine.** `app/`, `alembic/`, `alembic.ini`, `tests/`, `pytest.ini`,
  `requirements.txt`, `Dockerfile`, `.dockerignore`, `company_defaults.json` sont au
  premier niveau. C'est la source principale du désordre.
- **`rag_service/` est du code mort.** Suivi par git, dernier commit 2026-05-25,
  référencé par *aucun* fichier compose. Le vrai RAG vit dans le backend
  (`app/services/rag_service.py`) + le container `qdrant`. Décision : **supprimé**, pas
  de dépôt `adjuja-rag` créé -- ce serait une promesse vide.
- **`worker/` et `rd/` ne sont pas dans le dépôt** (ignorés par `.gitignore`). Laissés
  en place à la racine du dossier de travail, hors périmètre.
- **`data/` et `certbot/` ne contiennent qu'un `.gitkeep`** chacun.
- **Le `Dockerfile` racine construit aussi le frontend** (étape `frontend-builder`,
  copie `frontend/dist` dans l'image finale, montée sur `/ui` par `app/main.py:235`,
  montage conditionnel `if _FRONTEND_DIST.exists()`). Le frontend est donc construit
  deux fois : dans l'image API et dans le container `frontend` (nginx, port 8090).
  C'est la seule vraie difficulté de la découpe -- et en multi-dépôts elle devient
  bloquante : un dépôt ne peut pas builder le code d'un autre dépôt. Traitée dans
  `repos.md`, section "Le couplage Dockerfile ↔ frontend".

## Build order

1. `repos.md` -- topologie des dépôts, sort de l'historique, sort du `.git` actuel,
   couplage Dockerfile ↔ frontend. **Tout est à trancher avant la première commande.**
2. Créer les dépôts distants vides côté GitHub.
3. Découper : extraire ou initialiser chaque dépôt, dans l'ordre de `repos.md`.
4. `wiring.md` -- réécrire chaque référence de chemin, fichier par fichier.
5. Écrire `adjuja-infra/scripts/clone.sh` sur le modèle de
   `e-himaya-parent/scripts/clone.sh` (clone ou pull des N dépôts dans le dossier de
   travail), et le `README.md` de `adjuja-infra` qui devient le point d'entrée du projet.
6. Mettre à jour `CLAUDE.md`, les `README.md`, `context/architecture-context.md`,
   `conception/2. Architecture/architecture.md`.

## Check when the feature is done

- Un `clone.sh` lancé dans un dossier vide reconstitue tout le workspace et rien d'autre.
- `docker compose -f adjuja-infra/docker-compose.dev.yml up` démarre les 9 services dev
  (postgres, redis, minio, qdrant, api, celery-io, celery-cpu, celery-beat,
  ao-watcher-*) sans erreur de build ni de contexte manquant. **Vérifié par les logs
  réels des containers**, pas par l'absence d'erreur au lancement.
- `docker compose -f adjuja-infra/docker-compose.yml build` construit les 4 images
  (api, frontend, watcher, notification) sans échec.
- Depuis `adjuja-backend/` : `pytest` passe, et `alembic current` répond.
- La CI backend est verte dans son nouveau dépôt.
- Chaque dépôt a un `origin` qui répond et une branche par défaut poussée.
- Aucun fichier suivi aujourd'hui n'a disparu : la somme des fichiers des 6 dépôts, plus
  `rag_service/` supprimé volontairement, égale l'inventaire de `git ls-files` actuel.
