"""marches + offre_technique_jobs + filler_jobs + signing_jobs

Revision ID: 003
Revises: 002
Create Date: 2026-05-11
"""
from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "marches",
        sa.Column("id",         sa.String(36),  primary_key=True),
        sa.Column("org_id",     sa.String(36),  sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("user_id",    sa.String(36),  sa.ForeignKey("users.id"),          nullable=False),
        sa.Column("created_at", sa.String(50),  nullable=False),
        sa.Column("reference",  sa.String(255), nullable=False, default=""),
        sa.Column("acheteur",   sa.String(255), nullable=False, default=""),
        sa.Column("objet",      sa.Text(),      nullable=False, default=""),
        sa.Column("statut",     sa.String(50),  nullable=False, default="en_cours"),
        sa.Column("cps_key",    sa.String(512), nullable=True),
        sa.Column("rc_key",     sa.String(512), nullable=True),
    )
    op.create_index("idx_marches_org_id",  "marches", ["org_id"])
    op.create_index("idx_marches_user_id", "marches", ["user_id"])

    op.create_table(
        "offre_technique_jobs",
        sa.Column("id",         sa.String(36), primary_key=True),
        sa.Column("marche_id",  sa.String(36), sa.ForeignKey("marches.id"), nullable=False),
        sa.Column("org_id",     sa.String(36), nullable=False),
        sa.Column("created_at", sa.String(50), nullable=False),
        sa.Column("job_id",     sa.String(36), nullable=False),
        sa.Column("statut",     sa.String(50), nullable=False, default="termine"),
    )
    op.create_index("idx_ot_jobs_marche_id", "offre_technique_jobs", ["marche_id"])

    op.create_table(
        "filler_jobs",
        sa.Column("id",         sa.String(36), primary_key=True),
        sa.Column("marche_id",  sa.String(36), sa.ForeignKey("marches.id"), nullable=False),
        sa.Column("org_id",     sa.String(36), nullable=False),
        sa.Column("created_at", sa.String(50), nullable=False),
        sa.Column("job_id",     sa.String(36), nullable=False),
        sa.Column("statut",     sa.String(50), nullable=False, default="termine"),
    )
    op.create_index("idx_filler_jobs_marche_id", "filler_jobs", ["marche_id"])

    op.create_table(
        "signing_jobs",
        sa.Column("id",         sa.String(36), primary_key=True),
        sa.Column("marche_id",  sa.String(36), sa.ForeignKey("marches.id"), nullable=False),
        sa.Column("org_id",     sa.String(36), nullable=False),
        sa.Column("created_at", sa.String(50), nullable=False),
        sa.Column("job_id",     sa.String(36), nullable=False),
        sa.Column("statut",     sa.String(50), nullable=False, default="termine"),
    )
    op.create_index("idx_signing_jobs_marche_id", "signing_jobs", ["marche_id"])


def downgrade() -> None:
    op.drop_index("idx_signing_jobs_marche_id", table_name="signing_jobs")
    op.drop_table("signing_jobs")

    op.drop_index("idx_filler_jobs_marche_id", table_name="filler_jobs")
    op.drop_table("filler_jobs")

    op.drop_index("idx_ot_jobs_marche_id", table_name="offre_technique_jobs")
    op.drop_table("offre_technique_jobs")

    op.drop_index("idx_marches_user_id", table_name="marches")
    op.drop_index("idx_marches_org_id",  table_name="marches")
    op.drop_table("marches")
