"""Ajout owner_id sur organizations (feature invitation d'equipe)

Revision ID: 012
Revises: 011
Create Date: 2026-08-23
"""
from alembic import op
import sqlalchemy as sa

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # organizations n'a jamais ete peuplee avant cette feature (confirme en prod le
    # 2026-08-22, 0 ligne) -- NOT NULL direct sans backfill, aucune ligne existante.
    try:
        op.add_column(
            "organizations",
            sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        )
    except Exception:
        pass


def downgrade() -> None:
    try:
        op.drop_column("organizations", "owner_id")
    except Exception:
        pass
