from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from jose import jwt
from pydantic import BaseModel

from app.api.dependencies import get_current_user
from app.config.settings import Settings, get_settings
from app.models.user import Token, UserCreate, UserPublic
from app.services.user_service import UserService, get_user_service

router = APIRouter(prefix="/auth", tags=["Authentification"])


class LoginRequest(BaseModel):
    email:    str
    password: str


def _make_token(user_id: str, settings: Settings) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode(
        {"sub": user_id, "exp": expire},
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


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
    try:
        user = users.create(data)
    except ValueError as e:
        msg = str(e)
        code = status.HTTP_409_CONFLICT if "déjà utilisée" in msg else status.HTTP_500_INTERNAL_SERVER_ERROR
        raise HTTPException(status_code=code, detail=msg)
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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe incorrect.",
        )
    return Token(access_token=_make_token(user.id, settings))


@router.get(
    "/me",
    response_model=UserPublic,
    summary="Profil de l'utilisateur connecté",
)
def me(current_user: UserPublic = Depends(get_current_user)) -> UserPublic:
    return current_user
