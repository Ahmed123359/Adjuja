import uuid
from datetime import datetime, timezone

from passlib.context import CryptContext
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User
from app.models.user import UserCreate, UserPublic

_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


class UserService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def create(self, data: UserCreate, unlimited: bool = False) -> tuple[UserPublic, str]:
        user_id            = str(uuid.uuid4())
        created_at         = datetime.now(timezone.utc).isoformat()
        hashed             = _pwd_ctx.hash(data.password)
        verification_token = str(uuid.uuid4())
        email_verified     = True if unlimited else False
        max_generations    = 0    if unlimited else 1

        user = User(
            id=user_id,
            nom=data.nom,
            prenom=data.prenom,
            email=data.email,
            hashed_pwd=hashed,
            created_at=created_at,
            email_verified=email_verified,
            verification_token=verification_token,
            max_generations=max_generations,
        )
        self._db.add(user)
        try:
            await self._db.commit()
        except IntegrityError:
            await self._db.rollback()
            raise ValueError(f"L'adresse e-mail '{data.email}' est déjà utilisée.")

        return UserPublic(
            id=user_id, nom=data.nom, prenom=data.prenom, email=data.email,
            created_at=created_at, email_verified=email_verified,
            generations_used=0, max_generations=max_generations,
        ), verification_token

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

    async def verify_email(self, token: str) -> UserPublic | None:
        result = await self._db.execute(
            select(User).where(User.verification_token == token, User.email_verified == False)  # noqa: E712
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None
        await self._db.execute(
            update(User).where(User.id == row.id).values(
                email_verified=True, verification_token=None
            )
        )
        await self._db.commit()
        return await self.get_by_id(row.id)

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
        )
