"""Phase 5  Documents entreprise, équipe AO, signature par org

Revision ID: 007
Revises: 006
Create Date: 2026-05-25
"""
from alembic import op
import sqlalchemy as sa

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    from alembic import op as _op
    conn = _op.get_bind()
    result = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name=:t AND column_name=:c"
    ), {"t": table, "c": column})
    return result.fetchone() is not None


def _table_exists(table: str) -> bool:
    from alembic import op as _op
    conn = _op.get_bind()
    result = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables WHERE table_name=:t"
    ), {"t": table})
    return result.fetchone() is not None


def _index_exists(index: str) -> bool:
    from alembic import op as _op
    conn = _op.get_bind()
    result = conn.execute(sa.text(
        "SELECT 1 FROM pg_indexes WHERE indexname=:i"
    ), {"i": index})
    return result.fetchone() is not None


def upgrade() -> None:
    # company_profiles : signature + cachet par org
    if not _column_exists("company_profiles", "signature_minio_key"):
        op.add_column("company_profiles",
            sa.Column("signature_minio_key", sa.String(512), nullable=True))
    if not _column_exists("company_profiles", "cachet_minio_key"):
        op.add_column("company_profiles",
            sa.Column("cachet_minio_key", sa.String(512), nullable=True))

    # staff_cvs : spécialité + actif
    if not _column_exists("staff_cvs", "specialite"):
        op.add_column("staff_cvs",
            sa.Column("specialite", sa.String(255), nullable=False, server_default=""))
    if not _column_exists("staff_cvs", "actif"):
        op.add_column("staff_cvs",
            sa.Column("actif", sa.Boolean(), nullable=False, server_default="true"))

    # company_documents
    if not _table_exists("company_documents"):
        op.create_table(
            "company_documents",
            sa.Column("id",            sa.String(36),  nullable=False),
            sa.Column("org_id",        sa.String(36),  nullable=False),
            sa.Column("created_at",    sa.String(50),  nullable=False),
            sa.Column("updated_at",    sa.String(50),  nullable=False),
            sa.Column("doc_type",      sa.String(100), nullable=False),
            sa.Column("nom_fichier",   sa.String(255), nullable=False, server_default=""),
            sa.Column("minio_key",     sa.String(512), nullable=True),
            sa.Column("description",   sa.Text(),      nullable=True),
            sa.Column("date_validite", sa.String(50),  nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
    if not _index_exists("idx_companydoc_org_id"):
        op.create_index("idx_companydoc_org_id",   "company_documents", ["org_id"])
    if not _index_exists("idx_companydoc_doc_type"):
        op.create_index("idx_companydoc_doc_type", "company_documents", ["doc_type"])

    # ao_team_members
    if not _table_exists("ao_team_members"):
        op.create_table(
            "ao_team_members",
            sa.Column("id",                sa.String(36),  nullable=False),
            sa.Column("ao_id",             sa.String(36),  nullable=False),
            sa.Column("staff_cv_id",       sa.String(36),  nullable=True),
            sa.Column("created_at",        sa.String(50),  nullable=False),
            sa.Column("role_dans_offre",   sa.String(255), nullable=False, server_default=""),
            sa.Column("profil_requis_ref", sa.Text(),      nullable=True),
            sa.Column("warning",           sa.Boolean(),   nullable=False, server_default="false"),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["ao_id"],       ["appels_offres.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["staff_cv_id"], ["staff_cvs.id"],     ondelete="SET NULL"),
        )
    if not _index_exists("idx_aoteam_ao_id"):
        op.create_index("idx_aoteam_ao_id", "ao_team_members", ["ao_id"])


def downgrade() -> None:
    op.drop_table("ao_team_members")
    op.drop_table("company_documents")
    op.drop_column("staff_cvs", "actif")
    op.drop_column("staff_cvs", "specialite")
    op.drop_column("company_profiles", "cachet_minio_key")
    op.drop_column("company_profiles", "signature_minio_key")
