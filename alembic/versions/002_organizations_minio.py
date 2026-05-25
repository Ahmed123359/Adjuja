"""organizations + org_id + minio_job_id

Revision ID: 002
Revises: 001
Create Date: 2026-05-11
"""
from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id",         sa.String(36),  primary_key=True),
        sa.Column("name",       sa.String(255), nullable=False),
        sa.Column("slug",       sa.String(100), nullable=False, unique=True),
        sa.Column("created_at", sa.String(50),  nullable=False),
    )
    op.create_index("ix_organizations_slug", "organizations", ["slug"])

    op.add_column("users",   sa.Column("org_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=True))
    op.create_index("ix_users_org_id", "users", ["org_id"])

    op.add_column("launches", sa.Column("org_id",        sa.String(36), sa.ForeignKey("organizations.id"), nullable=True))
    op.add_column("launches", sa.Column("minio_job_id",  sa.String(36), nullable=True))
    op.create_index("idx_launches_org_id", "launches", ["org_id"])


def downgrade() -> None:
    op.drop_index("idx_launches_org_id",  table_name="launches")
    op.drop_column("launches", "minio_job_id")
    op.drop_column("launches", "org_id")

    op.drop_index("ix_users_org_id", table_name="users")
    op.drop_column("users", "org_id")

    op.drop_index("ix_organizations_slug", table_name="organizations")
    op.drop_table("organizations")
