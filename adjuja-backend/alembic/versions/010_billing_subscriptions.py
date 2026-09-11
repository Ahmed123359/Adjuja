"""Ajout subscriptions + billing_events (feature billing)

Revision ID: 010
Revises: 009
Create Date: 2026-07-18
"""
from alembic import op
import sqlalchemy as sa

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    try:
        op.create_table(
            "subscriptions",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("org_id", sa.String(36), sa.ForeignKey("organizations.id"), unique=True, index=True, nullable=False),
            sa.Column("plan_code", sa.String(20), nullable=False, server_default="free"),
            sa.Column("status", sa.String(20), nullable=False, server_default="active"),
            sa.Column("current_period_end", sa.String(50), nullable=True),
            sa.Column("provider", sa.String(20), nullable=False, server_default="manual"),
            sa.Column("provider_ref", sa.String(255), nullable=True),
            sa.Column("grace_until", sa.String(50), nullable=True),
            sa.Column("created_at", sa.String(50), nullable=False),
            sa.Column("updated_at", sa.String(50), nullable=False),
        )
    except Exception:
        pass

    try:
        op.create_table(
            "billing_events",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("provider", sa.String(20), nullable=False),
            sa.Column("provider_event_id", sa.String(255), nullable=False),
            sa.Column("org_id", sa.String(36), nullable=True),
            sa.Column("event_type", sa.String(50), nullable=False),
            sa.Column("raw_payload", sa.Text, nullable=False),
            sa.Column("processed_at", sa.String(50), nullable=False),
            sa.UniqueConstraint("provider", "provider_event_id", name="uq_billing_event"),
        )
    except Exception:
        pass


def downgrade() -> None:
    try:
        op.drop_table("billing_events")
    except Exception:
        pass
    try:
        op.drop_table("subscriptions")
    except Exception:
        pass
