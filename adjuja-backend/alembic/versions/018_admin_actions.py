"""Panneau d'administration : journal des actions (table admin_actions)

Revision ID: 018
Revises: 017
Create Date: 2026-09-30

Additive uniquement, validée par l'utilisateur le 2026-09-30. Idempotente
(IF NOT EXISTS), comme la 017.

Chaque action lancée depuis le panneau (relance d'un scrape, rattrapage des
détails, ré-analyse enrichie) laisse une ligne : qui, quoi, avec quels
paramètres, quand, et le compte rendu de la tâche. L'email de l'administrateur
est recopié : la ligne reste lisible si le compte disparaît, d'où aussi
l'absence de clé étrangère vers users.

Spec : context/feature-spec/admin-panel/api.md, « Journal des actions ».
"""
from alembic import op

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_actions (
            id            VARCHAR(36)  PRIMARY KEY,
            created_at    VARCHAR(50)  NOT NULL,
            termine_at    VARCHAR(50),
            admin_user_id VARCHAR(36)  NOT NULL,
            admin_email   VARCHAR(255) NOT NULL,
            module        VARCHAR(50)  NOT NULL,
            action        VARCHAR(50)  NOT NULL,
            params        JSONB,
            task_id       VARCHAR(255),
            statut        VARCHAR(20)  NOT NULL,
            resultat      JSONB
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON admin_actions (created_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_admin_actions_task ON admin_actions (task_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS admin_actions")
