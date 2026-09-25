"""Assistant par etape : table ao_assist_messages

Revision ID: 016
Revises: 015
Create Date: 2026-09-25

Additive uniquement, meme patron idempotent que les migrations 007 a 015.

La conversation avec l'assistant n'existait qu'en memoire du navigateur : un
rechargement, un changement d'etape ou un retour a la liste l'effacait. Sur un
dossier qu'on prepare sur plusieurs jours, cela revient a refaire chaque matin
l'analyse de la veille.

Table dediee plutot que `team_messages` : ce ne sont pas les memes objets. Un
message d'equipe a un auteur humain (`author_id` non nul, cle etrangere vers
users) et se lit par toute l'organisation ; un tour d'assistant a un `role`
('user' ou 'assistant'), appartient a un couple (dossier, etape), et porte des
sources. Les forcer dans la meme table imposerait un `author_id` nullable et un
discriminant, c'est-a-dire deux tables dans une.

`sources` garde les references citees par la reponse : sans elles, une reponse
relue trois jours plus tard n'est plus verifiable.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    try:
        op.create_table(
            "ao_assist_messages",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("org_id", sa.String(36), nullable=False),
            # Supprimer le dossier emporte ses conversations : elles n'ont pas
            # d'objet sans lui.
            sa.Column("ao_id", sa.String(36),
                      sa.ForeignKey("appels_offres.id", ondelete="CASCADE"), nullable=False),
            sa.Column("step_key", sa.String(50), nullable=False),
            # user | assistant
            sa.Column("role", sa.String(20), nullable=False),
            sa.Column("content", sa.Text, nullable=False),
            sa.Column("sources", postgresql.JSONB, nullable=True),
            # Qui a pose la question. Nul pour les tours de l'assistant.
            sa.Column("author_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.String(50), nullable=False),
        )
    except Exception:
        pass

    # La seule lecture reelle : un fil, dans l'ordre, pour un couple
    # (dossier, etape).
    try:
        op.create_index(
            "idx_assist_ao_step", "ao_assist_messages", ["ao_id", "step_key", "created_at"],
        )
    except Exception:
        pass


def downgrade() -> None:
    try:
        op.drop_index("idx_assist_ao_step", table_name="ao_assist_messages")
    except Exception:
        pass
    try:
        op.drop_table("ao_assist_messages")
    except Exception:
        pass
