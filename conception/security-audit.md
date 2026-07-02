# Audit de sécurité ADJUJA - 2026-07-02

Audit réalisé en mode offensif (revue de code statique) sur l'ensemble du projet.  
Toutes les vulnérabilités listées ci-dessous ont été **corrigées** dans la même session.

---

## Résumé exécutif

| Sévérité | Nombre | Statut |
|---|---|---|
| CRITIQUE | 1 | Corrigé |
| ÉLEVÉ | 3 | Corrigé |
| MOYEN | 4 | Corrigé |
| FAIBLE | 2 | Corrigé |
| **Total** | **10** | **Tous corrigés** |

---

## Vulnérabilités détaillées

---

### VUL-01 - Bypass complet de l'authentification JWT (CRITIQUE)

**Fichier :** `notification-service/app/api/router.py:21-25`  
**Statut :** Corrigé

**Description :**  
La fonction `_require_jwt` ne vérifiait que la présence du préfixe `"Bearer "` dans l'en-tête `Authorization`, sans jamais décoder ni valider la signature du token. Toute chaîne du type `"Bearer n'importe-quoi"` bypasse cette vérification et donne accès à toutes les routes `/preferences/`.

```python
# AVANT (vulnérable)
def _require_jwt(authorization: str = Header(...)) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token manquant.")
    return authorization  # jamais validé !
```

**Impact :** Un attaquant ayant accès au réseau interne Docker peut lire, modifier ou supprimer les préférences de notification de toutes les organisations sans aucun token valide.

**Correctif appliqué :**  
Décodage réel du JWT via `python-jose`, vérification de signature et d'expiration, résolution de l'`org_id` en base. Ajout de `python-jose[cryptography]` dans `notification-service/requirements.txt` et de `jwt_secret_key`/`jwt_algorithm` dans `notification-service/app/core/config.py`.

---

### VUL-02 - IDOR sur les préférences de notification (ÉLEVÉ)

**Fichier :** `notification-service/app/api/router.py:49-119`  
**Statut :** Corrigé (inclus dans VUL-01)

**Description :**  
Même en supposant qu'un JWT valide soit fourni, l'`org_id` dans l'URL de chemin (`/preferences/{org_id}`) n'était jamais comparé à l'`org_id` du JWT. L'organisation A pouvait lire ou modifier les préférences de l'organisation B en devinant son UUID.

**Impact :** Accès en lecture/écriture aux préférences de notification de n'importe quelle organisation (Insecure Direct Object Reference).

**Correctif appliqué :**  
Ajout de `_check_org_access(path_org_id, caller_org)` dans chaque endpoint `GET/PUT/DELETE /preferences/{org_id}`. Si l'`org_id` du JWT ne correspond pas au paramètre de chemin, HTTP 403 est retourné.

---

### VUL-03 - Endpoints de lecture non authentifiés sur ao-watcher (ÉLEVÉ)

**Fichier :** `ao-watcher/app/modules/ao_scraper/router.py:35-73`  
**Statut :** Corrigé

**Description :**  
Les endpoints `GET /aos`, `GET /aos/stats`, `GET /aos/{ao_id}` étaient accessibles sans aucune authentification via nginx (`/watcher/*`). Les endpoints de mutation (`PATCH /status`, `POST /import`) exigeaient eux un en-tête `Authorization`, créant une incohérence.

**Impact :** Exposition publique de l'ensemble des appels d'offres scrapés (titres, acheteurs, dates limites, statuts) à quiconque connaît l'URL.

**Correctif appliqué :**  
Ajout de `_auth: str = Depends(_require_auth_header)` sur `list_aos`, `get_stats` et `get_ao`.

---

### VUL-04 - Réinitialisation de quota et indexation RAG non authentifiées (ÉLEVÉ)

**Fichiers :** `app/api/routes/usage_routes.py`, `app/api/routes/rag_routes.py`  
**Statut :** Corrigé

**Description :**  
Trois endpoints exposés publiquement sans `Depends(get_current_user)` :

- `GET /api/v1/usage` - expose les statistiques d'utilisation globales
- `POST /api/v1/usage/reset` - **réinitialise le compteur de quota**, permettant de contourner les limites de génération
- `POST /api/v1/rag/index` - déclenche une reindexation ETL coûteuse en ressources

Le frontend appelait ces routes sans `authHeaders()`, cohérent avec l'absence d'auth côté serveur.

**Impact :** N'importe quel visiteur peut (1) effacer les compteurs de quota et générer sans limite, (2) déclencher des reindexations répétées pour saturer les ressources.

**Correctif appliqué :**  
Ajout de `_user: UserPublic = Depends(get_current_user)` dans les routes `get_usage`, `reset_usage` et `rag_index`. Mise à jour de `frontend/src/api.ts` pour ajouter `authHeaders()` sur ces trois appels.

---

### VUL-05 - Path Traversal via le nom de fichier dans signing (MOYEN)

**Fichier :** `app/api/routes/signing_routes.py:57-71`  
**Statut :** Corrigé

**Description :**  
Le nom du fichier PDF uploadé était utilisé directement, après un simple `.replace(".pdf", "")`, pour construire la clé MinIO et l'en-tête `Content-Disposition` :

```python
# AVANT (vulnérable)
original_name = (pdf.filename or "document").replace(".pdf", "")
minio_key = f"{org_id}/marches/{marche_id}/signing/{job_id}/{original_name}_signe.pdf"
headers={"Content-Disposition": f'attachment; filename="{filename}"'}
```

Un fichier nommé `../../etc/passwd.pdf` produirait la clé `{org_id}/marches/.../../../etc/passwd_signe.pdf`. Un fichier nommé `doc".pdf` injecterait un guillemet dans l'en-tête HTTP.

**Correctif appliqué :**  
Ajout de `_safe_filename()` utilisant `pathlib.Path.stem` pour supprimer les composants de chemin, puis `re.sub(r"[^\w\-]", "_", stem)[:80]` pour ne garder que les caractères alphanumériques et les tirets. Le résultat est utilisé pour la clé MinIO et le nom de téléchargement.

---

### VUL-06 - Spoofing MIME sur les uploads d'images (MOYEN)

**Fichier :** `app/api/routes/company_profile_routes.py:235-237`  
**Statut :** Corrigé

**Description :**  
`_upload_image_asset` vérifiait uniquement `file.content_type` (fourni par le client, falsifiable via `curl`) sans appeler `validate_logo()` qui existe dans `input_sanitizer.py` et vérifie les magic bytes réels (`\x89PNG` ou `\xff\xd8\xff`).

**Impact :** Un attaquant peut uploader un fichier HTML ou un exécutable en déclarant `Content-Type: image/png`. Le fichier est stocké dans MinIO et potentiellement servi tel quel via une presigned URL.

**Correctif appliqué :**  
Appel de `validate_logo(data, file.filename or "upload.png")` après lecture des bytes, avant toute logique d'extension.

---

### VUL-07 - Absence de vérification des magic bytes PDF (MOYEN)

**Fichiers :** `app/api/routes/ao_routes.py`, `app/api/routes/pdf_routes.py`, `app/api/routes/filler_routes.py`  
**Statut :** Corrigé

**Description :**  
Les trois routes d'upload de PDF ne vérifiaient que l'extension `.pdf` du nom de fichier, sans valider la signature binaire. Un fichier HTML malveillant, un script ou tout autre contenu peut être uploadé avec une extension `.pdf`.

**Impact :** Possibilité d'uploader des fichiers malveillants (XSS via SVG, exploit de parser PDF, contenu frauduleux) stockés dans MinIO et traités par les parsers de l'application.

**Correctif appliqué :**  
Ajout de `if not pdf_bytes.startswith(b"%PDF-"):` immédiatement après lecture des bytes dans les trois routes.

---

### VUL-08 - Absence de rate limiting sur le login (MOYEN)

**Fichier :** `app/api/routes/auth_routes.py:130`  
**Statut :** Corrigé

**Description :**  
L'endpoint `POST /api/v1/auth/login` n'avait aucune limite de débit. Un attaquant peut tenter un nombre illimité de mots de passe. Bien que bcrypt ralentisse chaque vérification, une attaque distribuée reste envisageable.

**Correctif appliqué :**  
Ajout du décorateur `@limiter.limit("5/minute")` et du paramètre `request: Request` (requis par slowapi). La limite s'applique par IP pour les requêtes sans token, et par `user_id` pour les requêtes authentifiées (clé définie dans `app/limiter.py`).

---

### VUL-09 - Mode debug activé par défaut (FAIBLE)

**Fichier :** `app/config/settings.py:58`  
**Statut :** Corrigé

**Description :**  
`app_debug: bool = True` : si la variable d'environnement `APP_DEBUG` n'est pas définie dans `.env`, le CORS est configuré à `["*"]`, permettant des appels cross-origin depuis n'importe quel domaine, y compris des pages malveillantes.

**Correctif appliqué :**  
Changement de la valeur par défaut en `False`. Les développeurs doivent explicitement ajouter `APP_DEBUG=true` dans leur `.env` local.

---

### VUL-10 - Fuite d'information dans les messages d'erreur (FAIBLE)

**Fichier :** `app/api/routes/pdf_routes.py:79`  
**Statut :** Corrigé

**Description :**  
```python
# AVANT
detail=f"Impossible d'extraire le texte du PDF : {e}"
```
L'exception brute `e` était incluse dans la réponse HTTP, exposant potentiellement des chemins internes, des versions de bibliothèques ou des traces de stack exploitables pour le fingerprinting.

**Correctif appliqué :**  
Message générique côté client. L'exception complète reste loggée côté serveur avec `exc_info=True`.

---

## Éléments de conception sécurisés confirmés

Les points suivants étaient déjà correctement implémentés et n'ont pas nécessité de correctif :

- **Hachage bcrypt** : `passlib` avec comparaison en temps constant (`verify_password`).
- **JWT HS256** : `python-jose`, clé minimum 32 caractères, rejet au démarrage si clé par défaut en prod (`model_validator` dans `settings.py`).
- **Isolation org_id** : Toutes les requêtes DB sur `appels_offres`, `ao_documents`, `company_profiles` filtrent par `org_id = current_user.org_id`.
- **Presigned URLs MinIO** : TTL de 15 minutes, fichiers non directement accessibles.
- **Sanitisation des prompts** : `sanitize_ao_text()` bloque les patterns d'injection de prompt connus.
- **Google OAuth** : Token vérifié par `google.oauth2.id_token.verify_oauth2_token`, pas de confiance implicite.
- **Validation mot de passe** : Longueur minimale 8 chars + chiffre obligatoire, côté serveur et non seulement frontend.
- **Rate limiting génération** : `@limiter.limit(settings.rate_limit_generate)` sur `POST /generate`.
- **CSRF** : Utilisation de tokens Bearer (non cookie), pas de risque CSRF classique.

---

## Recommandations complémentaires (non corrigées dans cette session)

| # | Recommandation | Effort | Priorité |
|---|---|---|---|
| R01 | Ajouter un index full-text `tsvector` sur `scraped_aos.titre` + `acheteur` pour remplacer les `ILIKE '%...%'` (performance ET déni de service par requête lente) | Moyen | Haute |
| R02 | Vérifier `email_verified=True` dans `user_service.verify_password` avant d'émettre un JWT | Faible | Moyenne |
| R03 | Ajouter une colonne `login_attempts` + verrouillage temporaire de compte après N échecs | Élevé | Moyenne |
| R04 | Configurer `Content-Security-Policy` sur nginx pour les réponses HTML/frontend | Faible | Moyenne |
| R05 | Passer `admin_secret` dans `notification-service` à une validation longueur >= 32 chars (même pattern que `jwt_secret_key`) | Faible | Faible |
| R06 | Ajouter des logs d'audit structurés (qui a fait quoi, quand, depuis quelle IP) dans un champ séparé | Élevé | Faible |

---

## Fichiers modifiés

| Fichier | Type de correctif |
|---|---|
| `notification-service/requirements.txt` | Ajout de `python-jose[cryptography]` |
| `notification-service/app/core/config.py` | Ajout de `jwt_secret_key` et `jwt_algorithm` |
| `notification-service/app/api/router.py` | Validation JWT réelle + résolution org_id + IDOR check |
| `ao-watcher/app/modules/ao_scraper/router.py` | Auth sur `list_aos`, `get_stats`, `get_ao` |
| `app/api/routes/usage_routes.py` | Auth sur `get_usage`, `reset_usage` |
| `app/api/routes/rag_routes.py` | Auth sur `rag_index` |
| `app/api/routes/signing_routes.py` | Sanitisation du nom de fichier (`_safe_filename`) |
| `app/api/routes/company_profile_routes.py` | Appel de `validate_logo()` sur magic bytes |
| `app/api/routes/ao_routes.py` | Vérification magic bytes `%PDF-` sur les 2 endpoints upload |
| `app/api/routes/pdf_routes.py` | Magic bytes + message d'erreur générique |
| `app/api/routes/filler_routes.py` | Vérification magic bytes `%PDF-` |
| `app/api/routes/auth_routes.py` | Rate limiting 5/minute sur `/login` |
| `app/config/settings.py` | `app_debug` par défaut à `False` |
| `frontend/src/api.ts` | `authHeaders()` sur `fetchUsage`, `resetUsage`, `reindexRag` |
