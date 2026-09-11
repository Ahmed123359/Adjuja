"""Supprimer la FK marches.org_id -> organizations

Revision ID: 004
Revises: 003
Create Date: 2026-05-11
"""
from alembic import op

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("marches_org_id_fkey", "marches", type_="foreignkey")


def downgrade() -> None:
    op.create_foreign_key(
        "marches_org_id_fkey", "marches", "organizations", ["org_id"], ["id"]
    )
