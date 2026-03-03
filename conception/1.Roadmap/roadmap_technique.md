# OffrIA — Roadmap technique

Décisions d'architecture, de sécurité et d'expérience produit.

> **Légende**
> `[PROD]` = obligatoire avant tout déploiement, même pour 5-10 utilisateurs
> `[SCALE]` = utile à partir de ~50+ utilisateurs simultanés ou en multi-réplica
> `[UX]` = amélioration produit, pas lié à la charge

---

## Sécurité & infrastructure

- [ ] `[PROD]` **HTTPS en production** — Ne jamais exposer le port 8000 directement.
  Mettre un reverse proxy (Nginx, Caddy, Traefik) avec certificat TLS devant l'API.
  Caddy est le plus simple : 3 lignes de config + TLS Let's Encrypt automatique.

- [x] `[PROD]` **Changer `JWT_SECRET_KEY`** — La valeur par défaut dans `.env.example`
  permet à n'importe qui de forger des tokens valides.
  Générer une clé forte : `openssl rand -hex 32`

- [x] `[PROD]` **Configurer les origines CORS autorisées** — `allow_origins=[]` en prod
  bloque tout le trafic cross-origin. Ajouter `ALLOWED_ORIGINS` dans `.env` de prod.

- [ ] `[SCALE]` **Audit log des connexions** — Tracer IP + timestamp + succès/échec
  sur `/auth/login` pour détecter les tentatives de brute force.

- [ ] `[SCALE]` **Protection CSRF** — `localStorage` est vulnérable aux attaques XSS.
  Pour durcir : passer à des cookies `HttpOnly + SameSite=Strict`.

---

## Authentification

- [ ] `[SCALE]` **Refresh tokens** — Le token actuel dure 7 jours sans possibilité de révocation.
  Ajouter access tokens courts (15 min) + refresh tokens longue durée stockés en DB.

- [ ] `[SCALE]` **Révocation de token** — Impossible de déconnecter un utilisateur de force
  (token volé, changement de mot de passe). Nécessite une table `revoked_tokens` ou
  de courtes durées de vie + refresh tokens.

- [ ] `[UX]` **Changement de mot de passe** — Endpoint `PATCH /auth/password`
  pour que l'utilisateur change son mot de passe sans passer par un admin.

- [x] `[PROD]` **Validation de la force du mot de passe** — Longueur minimale (8 car.),
  au moins un chiffre. À faire côté backend, pas seulement frontend.

---

## Base de données

- [ ] `[SCALE]` **Migration vers PostgreSQL** — SQLite est mono-writer et ne permet pas
  plusieurs réplicas de l'API. Migration : remplacer `sqlite3` par `asyncpg`,
  adapter les types SQL (`TEXT` → `UUID`, `INTEGER` → `BIGINT`).

- [ ] `[SCALE]` **Migrations de schéma (Alembic)** — Actuellement `CREATE TABLE IF NOT EXISTS`
  au démarrage. Ajouter Alembic pour gérer les évolutions sans perte de données.

- [ ] `[UX]` **Pagination de l'historique** — `GET /api/v1/history` retourne tout d'un coup.
  Ajouter `?page=1&limit=20` pour éviter les réponses lourdes.

---

## Usage & limites

- [x] `[PROD]` **UsageService persisté en DB** — Les compteurs sont en mémoire et remis
  à zéro à chaque restart. Stocker dans une table SQLite pour la prod minimale.

- [ ] `[SCALE]` **Usage par utilisateur** — Le compteur est global.
  Ajouter un suivi par `user_id` pour limiter la consommation individuelle.

- [ ] `[SCALE]` **Rate limiting** — Ajouter `slowapi` sur `POST /generate`
  (route coûteuse : 9 appels LLM). Pas nécessaire à 5-10 users.

---

## Scalabilité horizontale

- [ ] `[SCALE]` **Stateless API** — Vérifier qu'aucun état en mémoire n'empêche
  de lancer N réplicas. Principal suspect : `UsageService` (en mémoire).

- [ ] `[SCALE]` **Session store externalisé** — Si refresh tokens ajoutés,
  stocker dans Redis (TTL natif, accès O(1)) plutôt qu'en DB relationnelle.

---

## Expérience utilisateur

- [ ] `[UX]` **Page de profil** — Permettre de modifier nom / prénom / email.

- [ ] `[UX]` **Réinitialisation de mot de passe** — Flux "mot de passe oublié" par email
  (nécessite un service SMTP : SendGrid, Resend, ou SMTP local).

- [ ] `[UX]` **Export de l'historique** — Télécharger les réponses en PDF ou DOCX.

- [ ] `[UX]` **Recherche dans l'historique** — Filtrer par date, provider, nom d'entreprise.
