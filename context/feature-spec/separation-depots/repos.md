## Les six dépôts

Sur le modèle de `e-himaya`, le nom du dossier local et le nom du dépôt distant peuvent
différer (`clone.sh` fait la correspondance). Ici on les garde identiques, il n'y a
aucune raison de les désynchroniser.

| Dossier local | Contenu | Rôle e-himaya équivalent |
|---|---|---|
| `adjuja-backend` | `app/`, `alembic/`, `alembic.ini`, `tests/`, `pytest.ini`, `requirements.txt`, `Dockerfile`, `.dockerignore`, `company_defaults.json`, `ingest_knowledge_base.py`, `.github/workflows/`, `.pre-commit-config.yaml` | `cop-api` |
| `adjuja-frontend` | tout `frontend/` | `cop-client` |
| `adjuja-watcher` | tout `ao-watcher/` | — |
| `adjuja-notification` | tout `notification-service/` | `cop-notifier` |
| `adjuja-infra` | `docker-compose.yml`, `docker-compose.dev.yml`, `.env`, `.env.example`, `certbot/`, `data/`, `launch.bat`, `scripts/clone.sh`, `README.md` (point d'entrée du projet) | `e-himaya-parent` |
| `adjuja-docs` | `conception/`, `business_plan/`, `hafid-taches-docs/`, `context/`, `CLAUDE.md` | `cop-documentation` |

Supprimé, ne devient aucun dépôt : `rag_service/` (voir `00-overview.md`).

Restent à la racine du dossier de travail, non suivis, inchangés : `worker/`, `rd/`,
`Dossier AO HAFID/`, `venv/`.

## Décision 1 — le sort du `.git` actuel

Le dépôt actuel (`hafidlaadimi/technical-offer`, branche `main`, dernier commit `2635b21`)
est à la racine, qui doit devenir un dossier nu.

- **Option A -- il devient `adjuja-backend`.** Le backend *est* déjà la racine, donc son
  historique est presque intégralement celui du dépôt actuel. On déplace le `.git` dans
  `adjuja-backend/`, on y supprime tout ce qui appartient aux autres services, et on
  repointe `origin` vers un nouveau distant. Les autres dépôts sont créés à partir de ce
  même historique (décision 2). Rien n'est perdu, `technical-offer` reste intact côté
  GitHub comme archive de l'état d'avant.
- **Option B -- il est archivé tel quel** et les six dépôts repartent tous d'un commit
  initial propre. Plus simple, plus rapide, mais tout l'historique devient consultable
  uniquement dans l'ancien dépôt.

> **Décision prise (2026-09-10) : Option A.** Le `.git` actuel descend dans
> `adjuja-backend/`, qui hérite donc de l'historique complet du projet -- gratuitement,
> puisque le backend était déjà la racine. Les fichiers des autres services y
> apparaissent comme supprimés dans le commit de découpe, ce qui est exactement ce
> qu'on veut : ils ne font plus partie de ce dépôt.

## Décision 2 — l'historique par service

- **Option A -- extraction (`git filter-repo`).** Pour chaque service, on rejoue le
  dépôt actuel filtré sur ses chemins (`--path ao-watcher/ --path-rename ao-watcher/:`),
  ce qui donne un dépôt dont les commits sont ceux qui ont réellement touché ce service,
  chemins réécrits à la racine. Coût : `git filter-repo` à installer, une passe par
  service, et l'historique du backend garde les commits des autres services (il est le
  tronc). C'est ce qu'on veut si on tient à pouvoir faire un `git blame` utile.
- **Option B -- commit initial.** Chaque dépôt démarre sur un unique commit
  "initial import". Cinq minutes de travail, `git blame` inutile pour toujours.

> **Décision prise (2026-09-10) : Option B pour les cinq dépôts créés,
> `git filter-repo` n'est pas utilisé.** `adjuja-frontend`, `adjuja-watcher`,
> `adjuja-notification`, `adjuja-infra` et `adjuja-docs` démarrent chacun sur un unique
> commit "initial import". Leur historique d'avant la découpe reste consultable dans
> `adjuja-backend` (qui a hérité du `.git` complet, décision 1) et dans
> `hafidlaadimi/technical-offer`. Concrètement : un `git blame` sur un fichier frontend
> ne renverra plus que le commit de découpe, il faudra remonter dans l'historique du
> backend pour le vrai auteur.

## Décision 3 — le couplage Dockerfile ↔ frontend

C'est le point où la découpe n'est pas mécanique, et le multi-dépôts le durcit.

Le `Dockerfile` racine a une étape `frontend-builder` qui fait `COPY frontend/ .` puis
`npm run build`, et l'étape `final` fait `COPY --from=frontend-builder /frontend/dist
./frontend/dist/`. `app/main.py:233-235` monte ce dossier sur `/ui` **si** il existe.

En dépôts séparés, `adjuja-backend` ne contient plus le code du frontend : son Dockerfile
ne peut plus le construire. Contrairement au cas mono-dépôt, il n'y a pas d'option
"élargir le contexte de build" propre -- ça reviendrait à faire dépendre le build d'un
dépôt du contenu d'un autre, cloné au bon endroit, ce que rien ne garantit.

**Décision retenue : couper le lien.** Supprimer l'étape `frontend-builder` (l. 1-13) et
le `COPY --from=frontend-builder` de l'étape `final` dans `adjuja-backend/Dockerfile`.
Conséquence réelle : `/ui` n'existe plus sur le port 8000. Le montage étant conditionnel,
l'API ne plante pas, elle sert l'API seule. Le frontend reste servi par le container
`frontend` (nginx, port 8090), qui est déjà la vraie UI en prod. Bénéfice au passage :
fin du double build du frontend à chaque image API.

**À confirmer avant de le faire** : que plus rien en prod n'attaque `:8000/ui`. Vérifier
côté nginx/reverse-proxy réel, pas par déduction.

## Décision 4 — où vit `context/`

`context/` et `CLAUDE.md` pilotent le travail sur *tous* les services, ils n'appartiennent
à aucun d'eux. Trois placements possibles :

- **`adjuja-docs/`** (retenu par défaut, aligné sur `cop-documentation`) : versionné,
  cohérent avec le reste de la doc. Contrainte : Claude Code doit alors être lancé depuis
  `adjuja-docs/`, ou le dossier de travail doit porter un `CLAUDE.md` fin qui renvoie
  vers `adjuja-docs/context/`.
- **`adjuja-infra/`** : cohérent si on considère `adjuja-infra` comme le dépôt "racine du
  projet" (c'est lui qui porte `clone.sh` et le README d'entrée).
- **À la racine du dossier de travail, non versionné** : ce que fait `e-himaya` avec son
  `.claude/`.

> **Décision prise (2026-09-10) : racine du dossier de travail, non versionné.**
> `CLAUDE.md`, `context/` et `.claude/` restent à la racine de `Adjuja/`, aux côtés de
> `worker/`, `rd/` et `Dossier AO HAFID/`. Claude Code les trouve depuis n'importe quel
> sous-dossier, aucun fichier de renvoi n'est nécessaire.
>
> **Risque assumé, signalé une fois ici** : `context/progress-tracker.md` est la trace
> vivante du projet et n'a plus aucune sauvegarde par git. Une suppression accidentelle
> est définitive. Si ça devient gênant, le rapatrier dans `adjuja-docs/` est un
> déplacement de dossier, pas une refonte.

## Fichier `.env`

`.env` et `.env.example` partent dans `adjuja-infra/`, parce que l'interpolation Docker
Compose (`${POSTGRES_PASSWORD}`) lit le `.env` du répertoire du fichier compose, pas celui
du répertoire courant. C'est ce que fait `e-himaya-parent` (`.env`, `.env.prod` à côté des
compose).

Conséquence à documenter : la commande sans Docker (`uvicorn app.main:app --reload`)
tourne depuis `adjuja-backend/`, où `app/config/settings.py:299` cherche un `.env` relatif
au cwd. Il faut donc un `adjuja-backend/.env` local (à mettre dans son `.gitignore`).
Ne pas résoudre ça en modifiant `settings.py` sans en discuter -- c'est un service existant.
