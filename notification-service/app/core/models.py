from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class NotificationPreference(Base):
    """One row per org. Controls whether notifications are on and for which sectors."""

    __tablename__ = "notification_preferences"
    __table_args__ = (
        Index(
            "idx_notif_prefs_enabled",
            "enabled",
            postgresql_where="enabled = TRUE",
        ),
        {"schema": "notifications"},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    secteur_codes: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    notify_bdc: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cadence_unit: Mapped[str] = mapped_column(String(10), nullable=False, default="day")
    cadence_value: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    send_hour: Mapped[int] = mapped_column(Integer, nullable=False, default=8)
    max_items: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    last_notified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class NotificationLog(Base):
    """One row per (org, ao) pair. Primary deduplication guard."""

    __tablename__ = "notification_log"
    __table_args__ = (
        UniqueConstraint("org_id", "ao_id", name="uq_notif_log_org_ao"),
        Index("idx_notif_log_org_id", "org_id"),
        Index("idx_notif_log_sent_at", "sent_at"),
        {"schema": "notifications"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    org_id: Mapped[str] = mapped_column(String(36), nullable=False)
    ao_id: Mapped[int] = mapped_column(Integer, nullable=False)
    batch_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    channel: Mapped[str] = mapped_column(String(50), nullable=False, default="email_resend")
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class NotificationBatch(Base):
    """One row per batch run. Used for monitoring and the /admin/batches endpoint."""

    __tablename__ = "notification_batches"
    __table_args__ = (
        CheckConstraint(
            "status IN ('running', 'completed', 'failed')",
            name="ck_batch_status",
        ),
        {"schema": "notifications"},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    orgs_processed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    emails_sent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    orgs_skipped: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running")
