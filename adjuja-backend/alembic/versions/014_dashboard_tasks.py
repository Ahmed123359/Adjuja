"""Tableau de bord collaboratif : appels_offres.date_limite + table ao_tasks

Revision ID: 014
Revises: 013
Create Date: 2026-09-15

Additive uniquement, même patron idempotent que les migrations 007 à 013.

`date_limite` comble un trou réel : la veille envoie cette date à chaque import
(`FromWatcherPayload`), mais la table n'avait aucune colonne pour la recevoir et
la valeur était perdue en silence (voir `context/bugs-connus.md`). Les AO déjà
importés restent donc à NULL : leur date n'a jamais été stockée nulle part.

`ao_tasks` porte les tâches d'équipe. `ao_id` est nullable : une tâche peut ne
concerner aucun appel d'offres. La suppression d'un AO emporte ses tâches, qui
n'ont pas de sens sans lui.
"""
from alembic import op
import sqlalchemy as sa

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    try:
        op.add_column(
            "appels_offres",
            sa.Column("date_limite", sa.String(50), nullable=True),
        )
    except Exception:
        pass

    try:
        op.create_table(
            "ao_tasks",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("org_id", sa.String(36), nullable=False),
            sa.Column("ao_id", sa.String(36),
                      sa.ForeignKey("appels_offres.id", ondelete="CASCADE"), nullable=True),
            sa.Column("titre", sa.String(255), nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("assignee_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("statut", sa.String(20), nullable=False, server_default="a_faire"),
            sa.Column("echeance", sa.String(50), nullable=True),
            sa.Column("created_at", sa.String(50), nullable=False),
            sa.Column("updated_at", sa.String(50), nullable=False),
            sa.Column("completed_at", sa.String(50), nullable=True),
        )
    except Exception:
        pass

    # Les deux seules requêtes réelles de l'écran : les tâches de l'organisation,
    # et celles assignées à la personne connectée.
    try:
        op.create_index("idx_aotask_org_statut", "ao_tasks", ["org_id", "statut"])
    except Exception:
        pass
    try:
        op.create_index("idx_aotask_assignee_statut", "ao_tasks", ["assignee_id", "statut"])
    except Exception:
        pass
    try:
        op.create_index("idx_aotask_ao", "ao_tasks", ["ao_id"])
    except Exception:
        pass


def downgrade() -> None:
    for index in ("idx_aotask_ao", "idx_aotask_assignee_statut", "idx_aotask_org_statut"):
        try:
            op.drop_index(index, table_name="ao_tasks")
        except Exception:
            pass
    try:
        op.drop_table("ao_tasks")
    except Exception:
        pass
    try:
        op.drop_column("appels_offres", "date_limite")
    except Exception:
        pass
