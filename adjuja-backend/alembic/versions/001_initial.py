"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-05-02
"""
from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id",                 sa.String(36),  primary_key=True),
        sa.Column("nom",                sa.String(255), nullable=False),
        sa.Column("prenom",             sa.String(255), nullable=False),
        sa.Column("email",              sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_pwd",         sa.Text,        nullable=False),
        sa.Column("created_at",         sa.String(50),  nullable=False),
        sa.Column("email_verified",     sa.Boolean,     nullable=False, server_default="true"),
        sa.Column("verification_token", sa.String(36),  nullable=True),
        sa.Column("generations_used",   sa.Integer,     nullable=False, server_default="0"),
        sa.Column("max_generations",    sa.Integer,     nullable=False, server_default="0"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "launches",
        sa.Column("id",              sa.String(36),  primary_key=True),
        sa.Column("user_id",         sa.String(36),  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at",      sa.String(50),  nullable=False),
        sa.Column("ao_excerpt",      sa.Text,        nullable=False, server_default=""),
        sa.Column("company_nom",     sa.String(255), nullable=False, server_default=""),
        sa.Column("provider",        sa.String(50),  nullable=False, server_default=""),
        sa.Column("model",           sa.String(100), nullable=False, server_default=""),
        sa.Column("tokens_utilises", sa.Integer,     nullable=False, server_default="0"),
        sa.Column("langue",          sa.String(10),  nullable=False, server_default="fr"),
        sa.Column("result_json",     sa.Text,        nullable=False, server_default="{}"),
    )
    op.create_index("idx_launches_user_id", "launches", ["user_id"])

    op.create_table(
        "usage",
        sa.Column("id",               sa.Integer, primary_key=True),
        sa.Column("total_tokens",     sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_appels",     sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_tokens_ocr", sa.Integer, nullable=False, server_default="0"),
    )
    op.execute("INSERT INTO usage (id, total_tokens, total_appels, total_tokens_ocr) VALUES (1, 0, 0, 0)")


def downgrade() -> None:
    op.drop_table("launches")
    op.drop_table("usage")
    op.drop_table("users")
