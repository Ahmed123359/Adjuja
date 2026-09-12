"""Mode accompagne : colonne appels_offres.mode + table ao_pipeline_steps

Revision ID: 013
Revises: 012
Create Date: 2026-09-12

Additive uniquement. Les AO existants gardent mode="express" (le defaut), donc
leur comportement est strictement inchange : aucune migration de donnees.

ATTENTION AU DEPLOIEMENT : cette migration doit tourner AVANT le nouveau code.
`mode` est un agregat statistique de PostgreSQL, et `table.fonction` y est
equivalent a `fonction(table)` : tant que la colonne n'existe pas,
`appels_offres.mode` est lu comme un appel de fonction et toute requete sur les
AO echoue avec `WITHIN GROUP is required for ordered-set aggregate mode`, qui ne
ressemble en rien a « colonne inconnue ». Constate en dev le 2026-09-12.
Une fois la colonne creee, elle prend le pas sur la fonction (verifie).
"""
from alembic import op
import sqlalchemy as sa

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    try:
        op.add_column(
            "appels_offres",
            sa.Column("mode", sa.String(20), nullable=False, server_default="express"),
        )
    except Exception:
        pass

    try:
        op.create_table(
            "ao_pipeline_steps",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("ao_id", sa.String(36),
                      sa.ForeignKey("appels_offres.id", ondelete="CASCADE"), nullable=False),
            sa.Column("step_key", sa.String(50), nullable=False),
            sa.Column("step_order", sa.Integer, nullable=False),
            sa.Column("statut", sa.String(30), nullable=False, server_default="a_faire"),
            sa.Column("applicable", sa.Boolean, nullable=True),
            sa.Column("erreur_message", sa.Text, nullable=True),
            sa.Column("started_at", sa.String(50), nullable=True),
            sa.Column("completed_at", sa.String(50), nullable=True),
            sa.Column("validated_at", sa.String(50), nullable=True),
            sa.Column("validated_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
            sa.UniqueConstraint("ao_id", "step_key", name="uq_aostep_ao_step"),
        )
    except Exception:
        pass

    try:
        op.create_index("idx_aostep_ao_order", "ao_pipeline_steps", ["ao_id", "step_order"])
    except Exception:
        pass


def downgrade() -> None:
    try:
        op.drop_index("idx_aostep_ao_order", table_name="ao_pipeline_steps")
    except Exception:
        pass
    try:
        op.drop_table("ao_pipeline_steps")
    except Exception:
        pass
    try:
        op.drop_column("appels_offres", "mode")
    except Exception:
        pass
