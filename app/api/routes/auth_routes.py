import logging
import secrets
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from jose import jwt
from pydantic import BaseModel

from app.api.dependencies import get_current_user, get_user_service
from app.cache import cache
from app.config.settings import Settings, get_settings
from app.limiter import limiter
from pydantic import field_validator

from app.models.user import Token, UserCreate, UserPublic, PASSWORD_MIN_LENGTH, PASSWORD_REQUIRE_DIGIT, validate_password_strength
from app.services.email_service import send_password_reset_otp_email, send_verification_otp_email
from app.services.user_service import UserService

_OTP_TTL_SECONDS   = 15 * 60
_OTP_MAX_ATTEMPTS  = 5
_OTP_CACHE_PREFIX  = "pending_registration:"
_RESET_TTL_SECONDS  = 15 * 60
_RESET_MAX_ATTEMPTS = 5
_RESET_CACHE_PREFIX = "password_reset:"

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


class VerifyOtpRequest(BaseModel):
    email: str
    otp:   str


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Démarrer une inscription (envoie un code de vérification)",
)
@limiter.limit("5/minute")
async def register(
    request:  Request,
    data:     UserCreate,
    users:    UserService = Depends(get_user_service),
    settings: Settings    = Depends(get_settings),
) -> RegisterResponse:
    """Ne cree PAS de compte immediatement : envoie un code OTP par email, le
    compte n'est cree qu'apres confirmation via POST /auth/verify-otp. Exception :
    les admins (liste blanche settings.admin_emails) n'ont pas besoin de
    verification, compte + JWT crees directement comme avant."""
    if settings.allowed_emails and data.email.lower() not in [e.lower() for e in settings.allowed_emails]:
        logger.warning("Inscription refusée (hors liste blanche)  email=%s", data.email)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inscription sur invitation uniquement. Contactez l'administrateur.",
        )

    if await users.get_by_email(data.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"L'adresse e-mail '{data.email}' est déjà utilisée.",
        )

    is_admin   = data.email.lower() in [e.lower() for e in settings.admin_emails]
    hashed_pwd = UserService.hash_password(data.password)

    if is_admin:
        try:
            user = await users.create(
                nom=data.nom, prenom=data.prenom, email=data.email, hashed_pwd=hashed_pwd,
                entreprise=data.entreprise, secteur_activite=data.secteur_activite,
                nb_ao_par_an=data.nb_ao_par_an, unlimited=True, email_verified=True,
            )
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
        logger.info("Inscription admin réussie  user_id=%s email=%s", user.id, user.email)
        return RegisterResponse(message="admin_ok", access_token=_make_token(user.id, settings))

    otp = f"{secrets.randbelow(1_000_000):06d}"
    cache.set(
        f"{_OTP_CACHE_PREFIX}{data.email.lower()}",
        {
            "otp": otp, "attempts": 0,
            "nom": data.nom, "prenom": data.prenom, "email": data.email,
            "hashed_pwd": hashed_pwd, "entreprise": data.entreprise,
            "secteur_activite": data.secteur_activite, "nb_ao_par_an": data.nb_ao_par_an,
        },
        ttl=_OTP_TTL_SECONDS,
    )
    await send_verification_otp_email(to_email=data.email, otp=otp, resend_api_key=settings.resend_api_key)
    logger.info("Code OTP envoyé  email=%s", data.email)

    return RegisterResponse(message="otp_sent")


@router.post(
    "/verify-otp",
    response_model=Token,
    summary="Confirmer l'inscription via le code reçu par email",
)
@limiter.limit("10/minute")
async def verify_otp(
    request:  Request,
    data:     VerifyOtpRequest,
    users:    UserService = Depends(get_user_service),
    settings: Settings    = Depends(get_settings),
) -> Token:
    key     = f"{_OTP_CACHE_PREFIX}{data.email.lower()}"
    pending = cache.get(key)

    if not pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Code expiré ou introuvable. Recommencez l'inscription.",
        )

    if pending["attempts"] >= _OTP_MAX_ATTEMPTS:
        cache.delete(key)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trop de tentatives. Recommencez l'inscription.",
        )

    if data.otp != pending["otp"]:
        pending["attempts"] += 1
        cache.set(key, pending, ttl=_OTP_TTL_SECONDS)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Code invalide.")

    try:
        user = await users.create(
            nom=pending["nom"], prenom=pending["prenom"], email=pending["email"],
            hashed_pwd=pending["hashed_pwd"], entreprise=pending["entreprise"],
            secteur_activite=pending["secteur_activite"], nb_ao_par_an=pending["nb_ao_par_an"],
            unlimited=False, email_verified=True,
        )
    except ValueError as e:
        cache.delete(key)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))

    cache.delete(key)
    logger.info("Inscription confirmée via OTP  user_id=%s email=%s", user.id, user.email)
    return Token(access_token=_make_token(user.id, settings))


class ForgotPasswordRequest(BaseModel):
    email: str


class ForgotPasswordResponse(BaseModel):
    message: str = "otp_sent"


class ResetPasswordRequest(BaseModel):
    email:        str
    otp:          str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def valider_mot_de_passe(cls, v: str) -> str:
        return validate_password_strength(v)


@router.post(
    "/forgot-password",
    response_model=ForgotPasswordResponse,
    summary="Démarrer une réinitialisation de mot de passe (envoie un code par email)",
)
@limiter.limit("5/minute")
async def forgot_password(
    request:  Request,
    data:     ForgotPasswordRequest,
    users:    UserService = Depends(get_user_service),
    settings: Settings    = Depends(get_settings),
) -> ForgotPasswordResponse:
    """
    Toujours la même réponse, que l'email existe ou non : sinon un email inconnu
    répond différemment d'un email connu, ce qui permet à un attaquant de
    vérifier quels comptes existent (énumération). Le compte Google-only (pas de
    vrai mot de passe, hashed_pwd="__google_oauth__") peut aussi réinitialiser :
    ça lui ajoute simplement un mot de passe, ce qui est un service rendu, pas
    un problème -- l'utilisateur pourra ensuite se connecter par email/mdp OU
    Google, les deux methodes cohabitent deja pour les autres comptes.
    """
    user = await users.get_by_email(data.email)
    if user:
        otp = f"{secrets.randbelow(1_000_000):06d}"
        cache.set(
            f"{_RESET_CACHE_PREFIX}{data.email.lower()}",
            {"otp": otp, "attempts": 0, "user_id": user.id},
            ttl=_RESET_TTL_SECONDS,
        )
        await send_password_reset_otp_email(to_email=data.email, otp=otp, resend_api_key=settings.resend_api_key)
        logger.info("Code de réinitialisation envoyé  email=%s", data.email)
    else:
        logger.info("Réinitialisation demandée pour un email inconnu  email=%s", data.email)

    return ForgotPasswordResponse()


@router.post(
    "/reset-password",
    response_model=Token,
    summary="Confirmer la réinitialisation via le code reçu par email",
)
@limiter.limit("10/minute")
async def reset_password(
    request:  Request,
    data:     ResetPasswordRequest,
    users:    UserService = Depends(get_user_service),
    settings: Settings    = Depends(get_settings),
) -> Token:
    key     = f"{_RESET_CACHE_PREFIX}{data.email.lower()}"
    pending = cache.get(key)

    if not pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Code expiré ou introuvable. Recommencez la réinitialisation.",
        )

    if pending["attempts"] >= _RESET_MAX_ATTEMPTS:
        cache.delete(key)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trop de tentatives. Recommencez la réinitialisation.",
        )

    if data.otp != pending["otp"]:
        pending["attempts"] += 1
        cache.set(key, pending, ttl=_RESET_TTL_SECONDS)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Code invalide.")

    hashed_pwd = UserService.hash_password(data.new_password)
    await users.update_password(pending["user_id"], hashed_pwd)
    cache.delete(key)

    logger.info("Mot de passe réinitialisé  user_id=%s email=%s", pending["user_id"], data.email)
    return Token(access_token=_make_token(pending["user_id"], settings))


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


class GoogleCodeRequest(BaseModel):
    code: str
    redirect_uri: str  # doit correspondre exactement à ce qui a été utilisé pour obtenir le code


@router.post(
    "/google/callback",
    response_model=Token,
    summary="Connexion via Google OAuth (authorization code flow)",
)
async def login_google_callback(
    data: GoogleCodeRequest,
    users: UserService = Depends(get_user_service),
    settings: Settings = Depends(get_settings),
) -> Token:
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Google auth non configurée.")

    async with httpx.AsyncClient(timeout=10) as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": data.code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": data.redirect_uri,
                "grant_type": "authorization_code",
            },
        )

    if token_resp.status_code != 200:
        logger.warning("Échange code Google échoué  status=%s body=%s", token_resp.status_code, token_resp.text)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Connexion Google invalide.")

    google_id_token_str = token_resp.json().get("id_token")
    if not google_id_token_str:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Réponse Google invalide.")

    try:
        id_info = google_id_token.verify_oauth2_token(
            google_id_token_str,
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
