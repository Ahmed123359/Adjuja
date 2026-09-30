"""Panneau d'administration : suspension des comptes et dernière connexion

Revision ID: 019
Revises: 018
Create Date: 2026-09-30

Additive, validée par l'utilisateur le 2026-09-30. Idempotente (IF NOT EXISTS),
comme la 017.

- `users.disabled_at` : date de suspension par un administrateur, NULL si le
  compte est actif. Une suspension ne supprime rien ; elle est refusée à la
  connexion et à chaque requête (`get_current_user`).
- `users.last_login_at` : dernière connexion réussie (mot de passe, Google,
  confirmation d'inscription, acceptation d'invitation). Aucune date de
  connexion n'était enregistrée : « comptes inactifs » était invisible.

Chaînes ISO 8601, comme les autres dates de `users`.
Spec : context/feature-spec/admin-panel/api.md, « Comptes ».
"""
from alembic import op

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at VARCHAR(50)")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at VARCHAR(50)")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS last_login_at")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS disabled_at")
