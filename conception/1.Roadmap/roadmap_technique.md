# OffrIA Roadmap technique

Décisions d'architecture, de sécurité et d'expérience produit.

> **Légende**
> `[PROD]` = obligatoire avant tout déploiement, même pour 5-10 utilisateurs
> `[SCALE]` = utile à partir de ~50+ utilisateurs simultanés ou en multi-réplica
> `[UX]` = amélioration produit, pas lié à la charge
> `[QUALITE]` = amélioration de la qualité des réponses générées

---

## Sécurité & infrastructure

- [ ] `[PROD]` **HTTPS en production** Ne jamais exposer le port 8000 directement.
      Mettre un reverse proxy (Nginx, Caddy, Traefik) avec certificat TLS devant l'API.
      Caddy est le plus simple : 3 lignes de config + TLS Let's Encrypt automatique.

- [x] `[PROD]` **Changer `JWT_SECRET_KEY`** La valeur par défaut dans `.env.example`
      permet à n'importe qui de forger des tokens valides.
      Générer une clé forte : `openssl rand -hex 32`

- [x] `[PROD]` **Configurer les origines CORS autorisées** `allow_origins=[]` en prod
      bloque tout le trafic cross-origin. Ajouter `ALLOWED_ORIGINS` dans `.env` de prod.

- [ ] `[SCALE]` **Audit log des connexions** Tracer IP + timestamp + succès/échec
      sur `/auth/login` pour détecter les tentatives de brute force.

- [ ] `[SCALE]` **Protection CSRF** `localStorage` est vulnérable aux attaques XSS.
      Pour durcir : passer à des cookies `HttpOnly + SameSite=Strict`.

---

## Authentification

- [ ] `[SCALE]` **Refresh tokens** Le token actuel dure 7 jours sans possibilité de révocation.
      Ajouter access tokens courts (15 min) + refresh tokens longue durée stockés en DB.

- [ ] `[SCALE]` **Révocation de token** Impossible de déconnecter un utilisateur de force
      (token volé, changement de mot de passe). Nécessite une table `revoked_tokens` ou
      de courtes durées de vie + refresh tokens.

- [ ] `[UX]` **Changement de mot de passe** Endpoint `PATCH /auth/password`
      pour que l'utilisateur change son mot de passe sans passer par un admin.

- [x] `[PROD]` **Validation de la force du mot de passe** Longueur minimale (8 car.),
      au moins un chiffre. À faire côté backend, pas seulement frontend.

---

## Base de données

- [ ] `[SCALE]` **Migration vers PostgreSQL** SQLite est mono-writer et ne permet pas
      plusieurs réplicas de l'API. Migration : remplacer `sqlite3` par `asyncpg`,
      adapter les types SQL (`TEXT` → `UUID`, `INTEGER` → `BIGINT`).

- [ ] `[SCALE]` **Migrations de schéma (Alembic)** Actuellement `CREATE TABLE IF NOT EXISTS`
      au démarrage. Ajouter Alembic pour gérer les évolutions sans perte de données.

- [ ] `[UX]` **Pagination de l'historique** `GET /api/v1/history` retourne tout d'un coup.
      Ajouter `?page=1&limit=20` pour éviter les réponses lourdes.

---

## Usage & limites

- [x] `[PROD]` **UsageService persisté en DB** Les compteurs sont en mémoire et remis
      à zéro à chaque restart. Stocker dans une table SQLite pour la prod minimale.

- [ ] `[SCALE]` **Usage par utilisateur** Le compteur est global.
      Ajouter un suivi par `user_id` pour limiter la consommation individuelle.

- [x] `[SCALE]` **Rate limiting** Ajouter `slowapi` sur `POST /generate`
      (route coûteuse : 9 appels LLM). Pas nécessaire à 5-10 users.

---

## Scalabilité horizontale

- [ ] `[SCALE]` **Stateless API** Vérifier qu'aucun état en mémoire n'empêche
      de lancer N réplicas. Principal suspect : `UsageService` (en mémoire).

- [ ] `[SCALE]` **Session store externalisé** Si refresh tokens ajoutés,
      stocker dans Redis (TTL natif, accès O(1)) plutôt qu'en DB relationnelle.

---

## Expérience utilisateur

- [ ] `[UX]` **Page de profil** Permettre de modifier nom / prénom / email.

- [ ] `[UX]` **Réinitialisation de mot de passe** Flux "mot de passe oublié" par email
      (nécessite un service SMTP : SendGrid, Resend, ou SMTP local).

- [x] `[UX]` **Export de l'historique** Télécharger les réponses en PDF ou DOCX.

- [ ] `[UX]` **Recherche dans l'historique** Filtrer par date, provider, nom d'entreprise.

---

## Qualité de génération IA

- [x] `[QUALITE]` **Parser AO par LLM** Remplacer le parser regex par un appel LLM léger
      pour extraire titre, acheteur, critères et budget. Plus robuste sur les AO mal formatés,
      en tableaux, ou en anglais. Impact direct sur la pertinence des réponses.

- [x] `[QUALITE]` **Brief stratégique enrichi** _(priorité 1)_ Ajouter dans le brief une instruction
      pour lire et pondérer les sections selon les critères d'évaluation de l'AO.
      Exemple : "Prix 60% / Qualité 40%" → section financière plus développée, argumentation
      sur le ROI amplifiée. Résultat : réponses mieux alignées sur les critères du jury.

- [x] `[QUALITE]` **Affichage du brief stratégique** Brief retourné dans `GenerationResult`
      et affiché dans un onglet "Brief stratégique" à côté de l'onglet "Document".
      Permet à l'utilisateur de comprendre la stratégie choisie et de valider l'angle.

- [ ] `[QUALITE]` **Gestion des échecs partiels** Si 1 section sur 8 timeout ou échoue,
      générer les 7 autres et afficher une note sur la section manquante plutôt que d'échouer
      complètement. Améliore la résilience sur les modèles lents (Mistral, GPT-4o).

- [ ] `[QUALITE]` **Retry automatique** Backoff exponentiel (1s, 2s, 4s) sur timeout
      avant d'échouer définitivement. Évite à l'utilisateur de relancer manuellement.

- [ ] `[QUALITE]` **RAG activé** Configurer la base documentaire Qdrant avec des documents
      de référence de l'entreprise (anciens mémoires, fiches projet) pour injecter des
      exemples concrets dans les sections pertinentes. Fort impact sur la crédibilité des réponses.

- [ ] `[QUALITE]` **Détection automatique de la langue** Détecter la langue de l'AO
      (FR / EN / AR…) depuis le texte extrait et pré-remplir le sélecteur de langue.
      Évite les réponses générées dans la mauvaise langue si l'utilisateur oublie de changer.

- [ ] `[QUALITE]` **Validation post-OCR** Après transcription GPT-4o, vérifier que le texte
      extrait dépasse un seuil minimal de caractères et ne contient pas de refus ("I'm sorry…").
      Lever une erreur claire côté API plutôt que de passer un texte vide au générateur.

- [ ] `[QUALITE]` **Cohérence inter-sections** Passe finale : un appel LLM relit l'ensemble
      des 8 sections générées et détecte contradictions, répétitions ou incohérences de chiffres.
      Retourne une liste d'alertes optionnelle affichée dans l'onglet "Brief".

- [ ] `[QUALITE]` **Sections personnalisables** Permettre d'activer / désactiver / réordonner
      les sections depuis l'interface. Certains AO n'attendent pas 8 sections standard ;
      l'utilisateur devrait pouvoir adapter la structure avant de lancer la génération.

- [ ] `[QUALITE]` **Prompt templates éditables** Exposer les instructions de chaque section
      dans l'interface (zone de texte repliable). L'utilisateur peut affiner le prompt
      d'une section sans modifier le code. Stocker les templates personnalisés en DB par user.

- [ ] `[QUALITE]` **Résumé exécutif** Générer une 9ᵉ section "Note de synthèse" (1 page max)
      résumant la proposition de valeur, les atouts différenciants et les chiffres clés.
      Idéale pour les décideurs qui lisent en diagonale.

- [ ] `[QUALITE]` **Multi-turn brief** Après la phase 1 (brief stratégique), permettre à
      l'utilisateur d'affiner l'angle via un mini-chat (1-2 échanges) avant de lancer
      la génération des sections. Évite les regenerations complètes coûteuses.

- [ ] `[QUALITE]` **Score de qualité auto-évalué** Demander au LLM d'évaluer chaque section
      générée sur 3 critères (pertinence, précision, différenciation) avec un score /5.
      Afficher un badge coloré par section pour guider les révisions manuelles.

- [ ] `[QUALITE]` **Longueur adaptative** Calculer le nombre de mots cible par section
      en fonction de la longueur et de la complexité de l'AO (nb de critères, budget, durée).
      Les petits AO génèrent des sections trop longues actuellement.
