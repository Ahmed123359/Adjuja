from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Index,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ScrapedAo(Base):
    __tablename__ = "scraped_aos"
    __table_args__ = (
        UniqueConstraint("source", "external_id", name="uq_source_external"),
        CheckConstraint(
            "status IN ('new', 'seen', 'favorited', 'imported')",
            name="ck_scraped_ao_status",
        ),
        Index("idx_scraped_aos_status", "status"),
        Index("idx_scraped_aos_region", "region"),
        Index("idx_scraped_aos_categorie", "categorie"),
        Index("idx_scraped_aos_deadline", "date_limite"),
        Index("idx_scraped_aos_source", "source"),
        {"schema": "watcher"},
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    # Source identification
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    external_id: Mapped[str] = mapped_column(String(255), nullable=False)
    url_source: Mapped[str] = mapped_column(Text, nullable=False)

    # AO metadata
    acheteur: Mapped[str | None] = mapped_column(Text)
    titre: Mapped[str] = mapped_column(Text, nullable=False)
    date_publication: Mapped[date | None] = mapped_column(Date)
    date_limite: Mapped[date | None] = mapped_column(Date)
    categorie: Mapped[str | None] = mapped_column(String(100))
    secteur: Mapped[str | None] = mapped_column(String(200))
    region: Mapped[str | None] = mapped_column(String(100))
    ville: Mapped[str | None] = mapped_column(String(100))
    budget_estime: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    caution: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    description: Mapped[str | None] = mapped_column(Text)

    # Lifecycle
    status: Mapped[str] = mapped_column(String(20), default="new", nullable=False)
    scraped_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Document handling (populated lazily on favorite)
    zip_url: Mapped[str | None] = mapped_column(Text)
    zip_minio_key: Mapped[str | None] = mapped_column(Text)
    zip_downloaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    zip_error: Mapped[str | None] = mapped_column(Text)
    classified_docs: Mapped[dict | None] = mapped_column(JSON)
