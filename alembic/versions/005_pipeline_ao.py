"""Pipeline AO Phase 4 : appels_offres, ao_documents, company_profiles, staff_cvs

Revision ID: 005
Revises: 004
Create Date: 2026-05-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── appels_offres ────────────────────────────────────────────────────────
    op.create_table(
        "appels_offres",
        sa.Column("id",               sa.String(36),  primary_key=True),
        sa.Column("org_id",           sa.String(36),  nullable=False),
        sa.Column("user_id",          sa.String(36),  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at",       sa.String(50),  nullable=False),
        sa.Column("updated_at",       sa.String(50),  nullable=False),
        sa.Column("reference",        sa.String(255), nullable=False, server_default=""),
        sa.Column("acheteur",         sa.String(255), nullable=False, server_default=""),
        sa.Column("objet",            sa.Text(),      nullable=False, server_default=""),
        sa.Column("statut",           sa.String(50),  nullable=False, server_default="brouillon"),
        sa.Column("pipeline_pct",     sa.Integer(),   nullable=False, server_default="0"),
        sa.Column("erreur_message",   sa.Text(),      nullable=True),
        sa.Column("analyse_json",     JSONB,          nullable=True),
    )
    op.create_index("idx_ao_org_id",  "appels_offres", ["org_id"])
    op.create_index("idx_ao_user_id", "appels_offres", ["user_id"])
    op.create_index("idx_ao_statut",  "appels_offres", ["statut"])

    # ── ao_documents ─────────────────────────────────────────────────────────
    op.create_table(
        "ao_documents",
        sa.Column("id",            sa.String(36),  primary_key=True),
        sa.Column("ao_id",         sa.String(36),  sa.ForeignKey("appels_offres.id"), nullable=False),
        sa.Column("created_at",    sa.String(50),  nullable=False),
        sa.Column("dossier",       sa.String(50),  nullable=False),
        sa.Column("doc_type",      sa.String(100), nullable=False),
        sa.Column("origine",       sa.String(50),  nullable=False, server_default="upload"),
        sa.Column("statut",        sa.String(50),  nullable=False, server_default="en_attente"),
        sa.Column("minio_key",     sa.String(512), nullable=True),
        sa.Column("nom_fichier",   sa.String(255), nullable=False, server_default=""),
        sa.Column("taille_octets", sa.Integer(),   nullable=False, server_default="0"),
    )
    op.create_index("idx_aodoc_ao_id",    "ao_documents", ["ao_id"])
    op.create_index("idx_aodoc_doc_type", "ao_documents", ["doc_type"])

    # ── company_profiles ─────────────────────────────────────────────────────
    op.create_table(
        "company_profiles",
        sa.Column("id",                 sa.String(36),  primary_key=True),
        sa.Column("org_id",             sa.String(36),  nullable=False, unique=True),
        sa.Column("created_at",         sa.String(50),  nullable=False),
        sa.Column("updated_at",         sa.String(50),  nullable=False),
        sa.Column("nom_entreprise",     sa.String(255), nullable=False, server_default=""),
        sa.Column("ice",                sa.String(50),  nullable=False, server_default=""),
        sa.Column("rc",                 sa.String(50),  nullable=False, server_default=""),
        sa.Column("if_fiscal",          sa.String(50),  nullable=False, server_default=""),
        sa.Column("cnss",               sa.String(50),  nullable=False, server_default=""),
        sa.Column("adresse",            sa.Text(),      nullable=False, server_default=""),
        sa.Column("ville",              sa.String(100), nullable=False, server_default=""),
        sa.Column("telephone",          sa.String(20),  nullable=False, server_default=""),
        sa.Column("email",              sa.String(255), nullable=False, server_default=""),
        sa.Column("gerant_nom",         sa.String(255), nullable=False, server_default=""),
        sa.Column("gerant_prenom",      sa.String(255), nullable=False, server_default=""),
        sa.Column("gerant_cin",         sa.String(20),  nullable=False, server_default=""),
        sa.Column("secteur",            sa.String(255), nullable=False, server_default=""),
        sa.Column("extra",              JSONB,          nullable=True),
    )
    op.create_index("idx_company_profiles_org_id", "company_profiles", ["org_id"])

    # ── staff_cvs ────────────────────────────────────────────────────────────
    op.create_table(
        "staff_cvs",
        sa.Column("id",                  sa.String(36),  primary_key=True),
        sa.Column("org_id",              sa.String(36),  nullable=False),
        sa.Column("created_at",          sa.String(50),  nullable=False),
        sa.Column("updated_at",          sa.String(50),  nullable=False),
        sa.Column("nom",                 sa.String(255), nullable=False, server_default=""),
        sa.Column("prenom",              sa.String(255), nullable=False, server_default=""),
        sa.Column("poste",               sa.String(255), nullable=False, server_default=""),
        sa.Column("diplome",             sa.String(255), nullable=False, server_default=""),
        sa.Column("annees_experience",   sa.Integer(),   nullable=False, server_default="0"),
        sa.Column("details",             JSONB,          nullable=True),
        sa.Column("cv_minio_key",        sa.String(512), nullable=True),
    )
    op.create_index("idx_staffcv_org_id", "staff_cvs", ["org_id"])


def downgrade() -> None:
    op.drop_index("idx_staffcv_org_id",            table_name="staff_cvs")
    op.drop_table("staff_cvs")

    op.drop_index("idx_company_profiles_org_id",   table_name="company_profiles")
    op.drop_table("company_profiles")

    op.drop_index("idx_aodoc_doc_type",            table_name="ao_documents")
    op.drop_index("idx_aodoc_ao_id",               table_name="ao_documents")
    op.drop_table("ao_documents")

    op.drop_index("idx_ao_statut",                 table_name="appels_offres")
    op.drop_index("idx_ao_user_id",                table_name="appels_offres")
    op.drop_index("idx_ao_org_id",                 table_name="appels_offres")
    op.drop_table("appels_offres")
