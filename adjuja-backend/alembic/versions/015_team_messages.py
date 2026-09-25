"""Discussion d'équipe : table team_messages

Revision ID: 015
Revises: 014
Create Date: 2026-09-25

Additive uniquement, même patron idempotent que les migrations 007 à 014.

Comble le manque relevé dans
`context/feature-spec/dashboard-risque-validations/00-overview.md` : aucune table
ne portait de conversation. La collaboration se limitait à une liste de cases à
cocher, sans un mot échangé.

Portée d'un message : l'organisation. `task_id` et `ao_id` sont nullables et
donnent le fil :

  - les deux nuls        -> canal général de l'équipe ;
  - `task_id` renseigné  -> fil de cette tâche ;
  - `ao_id` renseigné    -> fil de ce dossier.

`mentions` et `refs` sont des JSONB plutôt que deux tables de liaison. Le choix
est assumé : on ne lit jamais « tous les messages mentionnant X » en balayant
l'organisation entière, on lit un fil, court, et ses mentions avec lui. Une
table de liaison ne servirait qu'à une notification par mention, qui n'existe
pas encore -- quand elle existera, un index GIN sur `mentions` répondra sans
changer le schéma.

Suppression : `deleted_at` plutôt qu'un DELETE. Effacer une ligne d'une
conversation troue le fil et rend incompréhensibles les réponses qui la
suivaient ; le message est masqué, son emplacement reste.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    try:
        op.create_table(
            "team_messages",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("org_id", sa.String(36), nullable=False),
            sa.Column("author_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("body", sa.Text, nullable=False),
            # Supprimer la tâche ou le dossier emporte son fil : il n'a plus
            # d'objet sans ce dont il parlait.
            sa.Column("task_id", sa.String(36),
                      sa.ForeignKey("ao_tasks.id", ondelete="CASCADE"), nullable=True),
            sa.Column("ao_id", sa.String(36),
                      sa.ForeignKey("appels_offres.id", ondelete="CASCADE"), nullable=True),
            # Identifiants des personnes mentionnées : ["user-id", ...]
            sa.Column("mentions", postgresql.JSONB, nullable=True),
            # Pièces citées : [{"type": "ao_document"|"ao"|"task", "id": ..., "label": ...}]
            sa.Column("refs", postgresql.JSONB, nullable=True),
            sa.Column("created_at", sa.String(50), nullable=False),
            sa.Column("deleted_at", sa.String(50), nullable=True),
        )
    except Exception:
        pass

    # Les deux seules lectures réelles : un fil, du plus récent au plus ancien.
    try:
        op.create_index("idx_msg_org_created", "team_messages", ["org_id", "created_at"])
    except Exception:
        pass
    try:
        op.create_index("idx_msg_task", "team_messages", ["task_id"])
    except Exception:
        pass
    try:
        op.create_index("idx_msg_ao", "team_messages", ["ao_id"])
    except Exception:
        pass


def downgrade() -> None:
    for index in ("idx_msg_ao", "idx_msg_task", "idx_msg_org_created"):
        try:
            op.drop_index(index, table_name="team_messages")
        except Exception:
            pass
    try:
        op.drop_table("team_messages")
    except Exception:
        pass
