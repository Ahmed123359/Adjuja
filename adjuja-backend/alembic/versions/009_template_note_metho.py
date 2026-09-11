"""Ajout template_note_metho_minio_key sur company_profiles

Revision ID: 009
Revises: 008
Create Date: 2026-05-30
"""
from alembic import op
import sqlalchemy as sa

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    try:
        op.add_column("company_profiles",
            sa.Column("template_note_metho_minio_key", sa.String(512), nullable=True))
    except Exception:
        pass


def downgrade() -> None:
    try:
        op.drop_column("company_profiles", "template_note_metho_minio_key")
    except Exception:
        pass
