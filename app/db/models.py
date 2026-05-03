from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str]                    = mapped_column(String(36), primary_key=True)
    nom: Mapped[str]                   = mapped_column(String(255))
    prenom: Mapped[str]                = mapped_column(String(255))
    email: Mapped[str]                 = mapped_column(String(255), unique=True, index=True)
    hashed_pwd: Mapped[str]            = mapped_column(Text)
    created_at: Mapped[str]            = mapped_column(String(50))
    email_verified: Mapped[bool]       = mapped_column(Boolean, default=True)
    verification_token: Mapped[str | None] = mapped_column(String(36), nullable=True)
    generations_used: Mapped[int]      = mapped_column(Integer, default=0)
    max_generations: Mapped[int]       = mapped_column(Integer, default=0)

    launches: Mapped[list["Launch"]]   = relationship(back_populates="user", cascade="all, delete-orphan")


class Launch(Base):
    __tablename__ = "launches"
    __table_args__ = (Index("idx_launches_user_id", "user_id"),)

    id: Mapped[str]              = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str]         = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[str]      = mapped_column(String(50))
    ao_excerpt: Mapped[str]      = mapped_column(Text, default="")
    company_nom: Mapped[str]     = mapped_column(String(255), default="")
    provider: Mapped[str]        = mapped_column(String(50), default="")
    model: Mapped[str]           = mapped_column(String(100), default="")
    tokens_utilises: Mapped[int] = mapped_column(Integer, default=0)
    langue: Mapped[str]          = mapped_column(String(10), default="fr")
    result_json: Mapped[str]     = mapped_column(Text, default="{}")

    user: Mapped["User"]         = relationship(back_populates="launches")


class Usage(Base):
    __tablename__ = "usage"

    id: Mapped[int]                = mapped_column(Integer, primary_key=True, default=1)
    total_tokens: Mapped[int]      = mapped_column(Integer, default=0)
    total_appels: Mapped[int]      = mapped_column(Integer, default=0)
    total_tokens_ocr: Mapped[int]  = mapped_column(Integer, default=0)
