import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, field_validator

from app.api.dependencies import get_current_user, get_subscription_service, get_user_service
from app.cache import cache
from app.config.settings import Settings, get_settings
from app.limiter import limiter
from app.models.user import Token, UserPublic, validate_password_strength
from app.services.email_service import send_org_invite_email
from app.services.jwt_service import create_access_token
from app.services.subscription_service import PlanLimitExceeded, SubscriptionService
from app.services.user_service import UserService

_INVITE_TTL_SECONDS  = 7 * 24 * 3600
_INVITE_CACHE_PREFIX = "org_invite:"

router = APIRouter(prefix="/org", tags=["Organisation / Équipe"])
logger = logging.getLogger(__name__)


class InviteRequest(BaseModel):
    email: str


class InviteResponse(BaseModel):
    message: str = "invite_sent"


@router.post("/invite", response_model=InviteResponse)
@limiter.limit("10/minute")
async def invite_member(
    request:      Request,
    data:         InviteRequest,
    current_user: UserPublic          = Depends(get_current_user),
    users:        UserService         = Depends(get_user_service),
    subs:         SubscriptionService = Depends(get_subscription_service),
    settings:     Settings            = Depends(get_settings),
) -> InviteResponse:
    """Pas de notion de rôle propriétaire/membre en v1 : n'importe quel membre de
    l'org peut inviter, tant que le plan a un siège disponible."""
    org_id = await users.ensure_own_org(current_user)

    try:
        await subs.check_seat_limit(org_id)
    except PlanLimitExceeded as e:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                f"Limite de sièges de votre plan atteinte ({e.limit}). "
                "Passez à un plan supérieur pour inviter davantage de membres."
            ),
        )

    if await users.get_by_email(data.email):
        # Pas de fusion de comptes existants en v1 : trop risqué (donnees deja
        # presentes sous son propre org solo). Message clair plutot que d'echouer
        # silencieusement ou de fusionner sans le dire.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"L'adresse e-mail '{data.email}' a déjà un compte ADJUJA. "
                "Impossible de l'ajouter directement à votre équipe pour le moment."
            ),
        )

    inviter_name = f"{current_user.prenom} {current_user.nom}".strip() or current_user.email
    token = secrets.token_urlsafe(32)
    cache.set(
        f"{_INVITE_CACHE_PREFIX}{token}",
        {"org_id": org_id, "email": data.email, "inviter_name": inviter_name},
        ttl=_INVITE_TTL_SECONDS,
    )
    invite_url = f"{settings.app_frontend_url}/accept-invite?token={token}"
    await send_org_invite_email(
        to_email=data.email,
        inviter_name=inviter_name,
        invite_url=invite_url,
        resend_api_key=settings.resend_api_key,
    )
    logger.info("Invitation envoyée  org=%s email=%s", org_id, data.email)
    return InviteResponse()


class InvitePreview(BaseModel):
    email:        str
    inviter_name: str


@router.get("/invite/{token}", response_model=InvitePreview)
async def preview_invite(token: str) -> InvitePreview:
    """Public (pas de JWT) : l'invité n'a pas encore de compte. Sert juste à
    afficher "X vous invite" sur la page d'acceptation avant de remplir le
    formulaire."""
    pending = cache.get(f"{_INVITE_CACHE_PREFIX}{token}")
    if not pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation expirée ou introuvable.")
    return InvitePreview(email=pending["email"], inviter_name=pending["inviter_name"])


class AcceptInviteRequest(BaseModel):
    token:    str
    nom:      str
    prenom:   str
    password: str

    @field_validator("password")
    @classmethod
    def valider_mot_de_passe(cls, v: str) -> str:
        return validate_password_strength(v)


@router.post("/accept-invite", response_model=Token)
@limiter.limit("10/minute")
async def accept_invite(
    request:  Request,
    data:     AcceptInviteRequest,
    users:    UserService = Depends(get_user_service),
    settings: Settings    = Depends(get_settings),
) -> Token:
    key     = f"{_INVITE_CACHE_PREFIX}{data.token}"
    pending = cache.get(key)
    if not pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation expirée ou introuvable.")

    if await users.get_by_email(pending["email"]):
        cache.delete(key)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"L'adresse e-mail '{pending['email']}' a déjà un compte.",
        )

    hashed_pwd = UserService.hash_password(data.password)
    try:
        user = await users.create(
            nom=data.nom, prenom=data.prenom, email=pending["email"], hashed_pwd=hashed_pwd,
            unlimited=False, email_verified=True, org_id=pending["org_id"],
        )
    except ValueError as e:
        cache.delete(key)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))

    cache.delete(key)
    await users.marquer_connexion(user.id)
    logger.info("Invitation acceptée  org=%s user_id=%s email=%s", pending["org_id"], user.id, user.email)
    return Token(access_token=create_access_token(user.id, settings))


@router.get("/members", response_model=list[UserPublic])
async def list_members(
    current_user: UserPublic  = Depends(get_current_user),
    users:        UserService = Depends(get_user_service),
) -> list[UserPublic]:
    """Avant la toute premiere invitation envoyee (aucune ligne Organization),
    org_id reste le raccourci org_id ?? id et "le proprietaire" == cet id : list_by_org
    ne le trouve jamais (son org_id reste NULL en base) donc on le rajoute a la main.
    Une fois Organization creee (ensure_own_org, voir invite_member), le proprietaire
    a un vrai org_id egal a celui des autres membres et apparait deja dans
    list_by_org -- get_org_owner_id() donne le bon id dans les deux cas, evite
    d'avoir a distinguer les deux etats ici."""
    org_id   = current_user.org_id or current_user.id
    members  = await users.list_by_org(org_id)
    owner_id = await users.get_org_owner_id(org_id) or org_id
    if not any(m.id == owner_id for m in members):
        owner = await users.get_by_id(owner_id)
        if owner:
            members = [owner] + members
    return members


@router.delete("/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    user_id:      str,
    current_user: UserPublic  = Depends(get_current_user),
    users:        UserService = Depends(get_user_service),
) -> None:
    org_id   = current_user.org_id or current_user.id
    owner_id = await users.get_org_owner_id(org_id) or org_id

    if user_id == owner_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible de retirer le propriétaire de l'organisation.",
        )

    target = await users.get_by_id(user_id)
    if not target or (target.org_id or target.id) != org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membre introuvable dans votre organisation.")

    await users.remove_from_org(user_id)
    logger.info("Membre retiré  org=%s user_id=%s", org_id, user_id)
