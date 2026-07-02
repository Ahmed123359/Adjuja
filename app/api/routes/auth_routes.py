import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from jose import jwt
from pydantic import BaseModel

from app.api.dependencies import get_current_user, get_user_service
from app.config.settings import Settings, get_settings
from app.limiter import limiter
from app.models.user import Token, UserCreate, UserPublic, PASSWORD_MIN_LENGTH, PASSWORD_REQUIRE_DIGIT
from app.services.email_service import send_verification_email
from app.services.user_service import UserService

router = APIRouter(prefix="/auth", tags=["Authentification"])
logger = logging.getLogger(__name__)


class LoginRequest(BaseModel):
    email:    str
    password: str


class RegisterResponse(BaseModel):
    message:      str        # "email_sent" | "admin_ok"
    access_token: str | None = None


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
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Créer un compte",
)
async def register(
    request:  Request,
    data:     UserCreate,
    users:    UserService = Depends(get_user_service),
    settings: Settings    = Depends(get_settings),
) -> RegisterResponse:
    if settings.allowed_emails and data.email.lower() not in [e.lower() for e in settings.allowed_emails]:
        logger.warning("Inscription refusée (hors liste blanche)  email=%s", data.email)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inscription sur invitation uniquement. Contactez l'administrateur.",
        )

    is_admin = data.email.lower() in [e.lower() for e in settings.admin_emails]

    try:
        user, verification_token = await users.create(data, unlimited=is_admin)
    except ValueError as e:
        msg = str(e)
        code = status.HTTP_409_CONFLICT if "déjà utilisée" in msg else status.HTTP_500_INTERNAL_SERVER_ERROR
        raise HTTPException(status_code=code, detail=msg)

    logger.info("Inscription réussie  user_id=%s email=%s admin=%s", user.id, user.email, is_admin)

    # Admins : vérification email non requise → JWT direct
    if is_admin:
        return RegisterResponse(message="admin_ok", access_token=_make_token(user.id, settings))

    # Envoi de l'email de vérification
    api_base_url = str(request.base_url).rstrip("/")
    await send_verification_email(
        to_email=user.email,
        token=verification_token,
        api_base_url=api_base_url,
        resend_api_key=settings.resend_api_key,
    )

    return RegisterResponse(message="email_sent")


@router.get(
    "/verify-email",
    summary="Vérifier l'adresse email via le token reçu par mail",
)
async def verify_email(
    token:    str,
    users:    UserService = Depends(get_user_service),
    settings: Settings    = Depends(get_settings),
) -> RedirectResponse:
    user = await users.verify_email(token)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lien de vérification invalide ou déjà utilisé.",
        )
    logger.info("Email vérifié  user_id=%s email=%s", user.id, user.email)
    frontend_url = settings.app_frontend_url.rstrip("/")
    return RedirectResponse(url=f"{frontend_url}/login?verified=true", status_code=302)


@router.post(
    "/login",
    response_model=Token,
    summary="Se connecter",
)
@limiter.limit("5/minute")
async def login(
    request: Request,
    data: LoginRequest,
    users: UserService = Depends(get_user_service),
    settings: Settings = Depends(get_settings),
) -> Token:
    user = await users.verify_password(data.email, data.password)
    if user is None:
        # WARNING : tentative de connexion échouée. Plusieurs WARNING consécutifs
        # sur le même email = signal potentiel de brute-force.
        logger.warning("Échec de connexion  email=%s", data.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe incorrect.",
        )

    logger.info("Connexion réussie  user_id=%s email=%s", user.id, user.email)
    return Token(access_token=_make_token(user.id, settings))


class GoogleTokenRequest(BaseModel):
    credential: str  # JWT renvoyé par Google Identity Services


@router.post(
    "/google",
    response_model=Token,
    summary="Connexion via Google OAuth",
)
async def login_google(
    data: GoogleTokenRequest,
    users: UserService = Depends(get_user_service),
    settings: Settings = Depends(get_settings),
) -> Token:
    if not settings.google_client_id:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Google auth non configurée.")

    try:
        id_info = google_id_token.verify_oauth2_token(
            data.credential,
            google_requests.Request(),
            settings.google_client_id,
        )
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token Google invalide.")

    email  = id_info.get("email", "")
    prenom = id_info.get("given_name", "")
    nom    = id_info.get("family_name", "") or prenom

    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email manquant dans le token Google.")

    if settings.allowed_emails and email.lower() not in [e.lower() for e in settings.allowed_emails]:
        logger.warning("Connexion Google refusée (hors liste blanche)  email=%s", email)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès sur invitation uniquement.")

    user = await users.get_or_create_google_user(email=email, prenom=prenom, nom=nom)
    logger.info("Connexion Google réussie  user_id=%s email=%s", user.id, email)
    return Token(access_token=_make_token(user.id, settings))


@router.get(
    "/me",
    response_model=UserPublic,
    summary="Profil de l'utilisateur connecté",
)
def me(current_user: UserPublic = Depends(get_current_user)) -> UserPublic:
    return current_user
