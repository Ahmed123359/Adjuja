import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from jose import jwt
from pydantic import BaseModel

from app.api.dependencies import get_current_user
from app.config.settings import Settings, get_settings
from app.models.user import Token, UserCreate, UserPublic, PASSWORD_MIN_LENGTH, PASSWORD_REQUIRE_DIGIT
from app.services.user_service import UserService, get_user_service

router = APIRouter(prefix="/auth", tags=["Authentification"])
logger = logging.getLogger(__name__)


class LoginRequest(BaseModel):
    email:    str
    password: str


class PasswordRules(BaseModel):
    """Règles de validation du mot de passe, exposées au frontend."""
    min_length:    int  = PASSWORD_MIN_LENGTH
    require_digit: bool = PASSWORD_REQUIRE_DIGIT


def _make_token(user_id: str, settings: Settings) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode(
        {"sub": user_id, "exp": expire},
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


@router.get(
    "/password-rules",
    response_model=PasswordRules,
    summary="Règles de validation du mot de passe",
    description=(
        "Retourne les règles de validation du mot de passe définies côté backend. "
        "Le frontend les lit au montage pour synchroniser son UI (label, minLength) "
        "sans duplication de logique."
    ),
)
def password_rules() -> PasswordRules:
    # Pas de logique ici : les constantes font tout le travail.
    # Si PASSWORD_MIN_LENGTH passe à 10 dans user.py, cet endpoint retourne 10
    # automatiquement et le formulaire d'inscription se met à jour sans retouche.
    return PasswordRules()


@router.post(
    "/register",
    response_model=Token,
    status_code=status.HTTP_201_CREATED,
    summary="Créer un compte",
)
def register(
    data: UserCreate,
    users: UserService = Depends(get_user_service),
    settings: Settings = Depends(get_settings),
) -> Token:
    # Vérification de la liste blanche si elle est définie.
    # allowed_emails vide = inscription ouverte à tous.
    # On normalise en minuscules des deux côtés pour éviter les erreurs de casse.
    if settings.allowed_emails and data.email.lower() not in [e.lower() for e in settings.allowed_emails]:
        # WARNING et non ERROR : ce n'est pas un bug, c'est une tentative d'inscription
        # hors liste blanche. Utile pour détecter des inscriptions non autorisées.
        logger.warning("Inscription refusée (hors liste blanche) — email=%s", data.email)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inscription sur invitation uniquement. Contactez l'administrateur.",
        )

    try:
        user = users.create(data)
    except ValueError as e:
        msg = str(e)
        code = status.HTTP_409_CONFLICT if "déjà utilisée" in msg else status.HTTP_500_INTERNAL_SERVER_ERROR
        raise HTTPException(status_code=code, detail=msg)

    logger.info("Inscription réussie — user_id=%s email=%s", user.id, user.email)
    return Token(access_token=_make_token(user.id, settings))


@router.post(
    "/login",
    response_model=Token,
    summary="Se connecter",
)
def login(
    data: LoginRequest,
    users: UserService = Depends(get_user_service),
    settings: Settings = Depends(get_settings),
) -> Token:
    user = users.verify_password(data.email, data.password)
    if user is None:
        # WARNING : tentative de connexion échouée. Plusieurs WARNING consécutifs
        # sur le même email = signal potentiel de brute-force.
        logger.warning("Échec de connexion — email=%s", data.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe incorrect.",
        )

    logger.info("Connexion réussie — user_id=%s email=%s", user.id, user.email)
    return Token(access_token=_make_token(user.id, settings))


@router.get(
    "/me",
    response_model=UserPublic,
    summary="Profil de l'utilisateur connecté",
)
def me(current_user: UserPublic = Depends(get_current_user)) -> UserPublic:
    return current_user
