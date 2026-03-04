from slowapi import Limiter
from fastapi import Request


def _user_or_ip(request: Request) -> str:
    """
    Clé d'identification pour le rate limiter.

    Stratégie :
    1. Si la requête contient un token Bearer JWT valide → clé = "user:<user_id>"
       Chaque utilisateur a son propre compteur, indépendamment de son IP.
       Avantage : un user derrière un proxy partagé n'est pas confondu avec les autres.

    2. Sinon (token absent ou invalide) → clé = adresse IP du client.
       Cas couvert : requêtes non authentifiées sur /generate, qui seront
       de toute façon rejetées par get_current_user() avec un 401.

    Note : on ne vérifie pas l'expiration du token ici (verify_exp=False).
    La validation complète (expiration, signature stricte) est faite par
    get_current_user() dans dependencies.py. Pour le rate limiting, on veut
    juste identifier qui envoie la requête, même si le token est expiré.
    """
    from app.config.settings import get_settings
    from jose import jwt, JWTError

    settings = get_settings()
    auth = request.headers.get("Authorization", "")

    if auth.startswith("Bearer "):
        try:
            payload = jwt.decode(
                auth[7:],
                settings.jwt_secret_key,
                algorithms=[settings.jwt_algorithm],
                # On ne vérifie pas l'expiration : on veut juste l'identité
                options={"verify_exp": False},
            )
            user_id = payload.get("sub", "")
            if user_id:
                return f"user:{user_id}"
        except JWTError:
            pass

    # Fallback sur l'IP si le token est absent ou mal formé
    return request.client.host if request.client else "unknown"


# Instance singleton du limiter — partagée entre main.py et les routes.
# key_func=_user_or_ip : une limite par utilisateur identifié (pas par IP globale).
limiter = Limiter(key_func=_user_or_ip)
