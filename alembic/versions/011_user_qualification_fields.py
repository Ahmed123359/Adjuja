"""Ajout entreprise, secteur_activite, nb_ao_par_an sur users (audit B7)

Revision ID: 011
Revises: 010
Create Date: 2026-08-13
"""
from alembic import op
import sqlalchemy as sa

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for col, coltype, kwargs in (
        ("entreprise",        sa.String(255), {"nullable": False, "server_default": ""}),
        ("secteur_activite",  sa.String(100), {"nullable": False, "server_default": ""}),
        ("nb_ao_par_an",      sa.Integer,     {"nullable": True}),
    ):
        try:
            op.add_column("users", sa.Column(col, coltype, **kwargs))
        except Exception:
            pass


def downgrade() -> None:
    for col in ("entreprise", "secteur_activite", "nb_ao_par_an"):
        try:
            op.drop_column("users", col)
        except Exception:
            pass
