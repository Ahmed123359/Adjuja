import uuid
from datetime import datetime, timezone

from passlib.context import CryptContext
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Organization, User
from app.models.user import UserPublic

_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


class UserService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    @staticmethod
    def hash_password(password: str) -> str:
        return _pwd_ctx.hash(password)

    async def create(
        self,
        *,
        nom: str,
        prenom: str,
        email: str,
        hashed_pwd: str,
        entreprise: str = "",
        secteur_activite: str = "",
        nb_ao_par_an: int | None = None,
        unlimited: bool = False,
        email_verified: bool = False,
        org_id: str | None = None,
    ) -> UserPublic:
        """Cree la ligne `users` reelle. Appele soit immediatement (admin, pas de
        verification requise), soit apres confirmation OTP reussie -- jamais avant,
        voir POST /auth/register et /auth/verify-otp. org_id n'est passe que pour un
        compte cree via une invitation d'equipe (POST /auth/accept-invite) -- sinon
        None, l'utilisateur reste son propre org (cf. pattern org_id ?? id partout
        ailleurs dans le code)."""
        user_id          = str(uuid.uuid4())
        created_at       = datetime.now(timezone.utc).isoformat()
        max_generations  = 0 if unlimited else 1

        user = User(
            id=user_id,
            org_id=org_id,
            nom=nom,
            prenom=prenom,
            email=email,
            hashed_pwd=hashed_pwd,
            created_at=created_at,
            email_verified=email_verified,
            max_generations=max_generations,
            entreprise=entreprise,
            secteur_activite=secteur_activite,
            nb_ao_par_an=nb_ao_par_an,
        )
        self._db.add(user)
        try:
            await self._db.commit()
        except IntegrityError:
            await self._db.rollback()
            raise ValueError(f"L'adresse e-mail '{email}' est déjà utilisée.")

        return UserPublic(
            id=user_id, org_id=org_id, nom=nom, prenom=prenom, email=email,
            created_at=created_at, email_verified=email_verified,
            generations_used=0, max_generations=max_generations,
            entreprise=entreprise, secteur_activite=secteur_activite,
            nb_ao_par_an=nb_ao_par_an,
        )

    async def get_by_email(self, email: str) -> UserPublic | None:
        result = await self._db.execute(select(User).where(User.email == email))
        row = result.scalar_one_or_none()
        return self._to_public(row) if row else None

    async def verify_password(self, email: str, password: str) -> UserPublic | None:
        result = await self._db.execute(select(User).where(User.email == email))
        row = result.scalar_one_or_none()
        if row is None or not _pwd_ctx.verify(password, row.hashed_pwd):
            return None
        return self._to_public(row)

    async def get_by_id(self, user_id: str) -> UserPublic | None:
        result = await self._db.execute(select(User).where(User.id == user_id))
        row = result.scalar_one_or_none()
        return self._to_public(row) if row else None

    async def get_or_create_google_user(self, email: str, prenom: str, nom: str) -> UserPublic:
        existing = await self.get_by_email(email)
        if existing:
            return existing

        user_id    = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        user = User(
            id=user_id, nom=nom, prenom=prenom, email=email,
            hashed_pwd="__google_oauth__", created_at=created_at,
            email_verified=True, max_generations=1,
        )
        self._db.add(user)
        try:
            await self._db.commit()
        except IntegrityError:
            await self._db.rollback()
            existing = await self.get_by_email(email)
            if existing:
                return existing
            raise

        return UserPublic(
            id=user_id, nom=nom, prenom=prenom, email=email,
            created_at=created_at, email_verified=True,
            generations_used=0, max_generations=1,
        )

    async def ensure_own_org(self, user: UserPublic) -> str:
        """Retourne l'org_id de l'utilisateur, en créant une vraie ligne
        Organization et en la lui assignant si besoin (première invitation
        envoyée). Ailleurs dans le code, la lecture utilise le raccourci
        `org_id or id` sans jamais l'écrire en base -- mais assigner un org_id
        explicite à un membre invité exige une vraie ligne Organization à
        référencer, la contrainte FK sur users.org_id ne connaît pas ce
        raccourci."""
        if user.org_id:
            return user.org_id

        org_id = str(uuid.uuid4())
        org = Organization(
            id=org_id,
            owner_id=user.id,
            name=user.entreprise or f"{user.prenom} {user.nom}".strip(),
            slug=f"org-{org_id[:8]}",
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        self._db.add(org)
        await self._db.execute(update(User).where(User.id == user.id).values(org_id=org_id))
        await self._db.commit()
        return org_id

    async def get_org_owner_id(self, org_id: str) -> str | None:
        result = await self._db.execute(select(Organization.owner_id).where(Organization.id == org_id))
        return result.scalar_one_or_none()

    async def list_by_org(self, org_id: str) -> list[UserPublic]:
        result = await self._db.execute(select(User).where(User.org_id == org_id))
        return [self._to_public(row) for row in result.scalars().all()]

    async def remove_from_org(self, user_id: str) -> None:
        """Retire un membre de l'org (org_id -> NULL) : redevient un compte solo,
        perd l'accès aux données de l'org (profil, AOs, CVs...), mais garde son
        compte et son mot de passe. Ne supprime jamais le compte lui-même --
        "retirer de l'équipe" != "supprimer le compte"."""
        await self._db.execute(
            update(User).where(User.id == user_id).values(org_id=None)
        )
        await self._db.commit()

    async def update_password(self, user_id: str, hashed_pwd: str) -> None:
        await self._db.execute(
            update(User).where(User.id == user_id).values(hashed_pwd=hashed_pwd)
        )
        await self._db.commit()

    async def increment_generations(self, user_id: str) -> None:
        await self._db.execute(
            update(User).where(User.id == user_id).values(
                generations_used=User.generations_used + 1
            )
        )
        await self._db.commit()

    @staticmethod
    def _to_public(row: User) -> UserPublic:
        return UserPublic(
            id=row.id, org_id=row.org_id, nom=row.nom, prenom=row.prenom, email=row.email,
            created_at=row.created_at, email_verified=row.email_verified,
            generations_used=row.generations_used, max_generations=row.max_generations,
            entreprise=row.entreprise, secteur_activite=row.secteur_activite,
            nb_ao_par_an=row.nb_ao_par_an,
        )
