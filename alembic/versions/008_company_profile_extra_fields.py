"""Ajout capital_social, rib, forme_juridique sur company_profiles

Revision ID: 008
Revises: 007
Create Date: 2026-05-28
"""
from alembic import op
import sqlalchemy as sa

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for col in ("capital_social", "rib", "forme_juridique"):
        try:
            op.add_column("company_profiles",
                sa.Column(col, sa.String(100), nullable=False, server_default=""))
        except Exception:
            pass


def downgrade() -> None:
    for col in ("capital_social", "rib", "forme_juridique"):
        try:
            op.drop_column("company_profiles", col)
        except Exception:
            pass
