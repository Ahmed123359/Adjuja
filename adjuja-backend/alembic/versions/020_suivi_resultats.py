"""Suivi d'un dossier après dépôt : étapes, offres lues, résultat

Revision ID: 020
Revises: 019
Create Date: 2026-10-01

Additive, validée par l'utilisateur le 2026-10-01. Idempotente (IF NOT EXISTS).
Spec : context/feature-spec/suivi-resultats/00-overview.md (phase 1).

- `ao_suivi` : une ligne par dossier déposé. Nature du marché (elle fixe la
  règle d'attribution, décret 2-22-431 art. 43), estimation du maître
  d'ouvrage, paramètres du règlement de consultation pour les études
  (poids financier, seuil technique), dates, résultat final.
- `ao_offres_concurrentes` : une ligne par soumissionnaire, **le nôtre
  compris** (`est_nous`) : nos statuts administratif et technique sont ceux de
  notre ligne, comme pour les concurrents, au lieu d'être dupliqués.

Les deux disparaissent avec le dossier (ON DELETE CASCADE). Montants en
NUMERIC(15,2), dates en chaînes ISO comme les autres tables.
"""
from alembic import op

revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS ao_suivi (
            ao_id                  VARCHAR(36)   PRIMARY KEY REFERENCES appels_offres(id) ON DELETE CASCADE,
            nature_marche          VARCHAR(30)   NOT NULL DEFAULT 'travaux',
            estimation_mad         NUMERIC(15,2),
            poids_financier        NUMERIC(5,2),
            seuil_technique        NUMERIC(5,2),
            date_depot             VARCHAR(50),
            date_ouverture         VARCHAR(50),
            statut_final           VARCHAR(20)   NOT NULL DEFAULT 'en_attente',
            attributaire           VARCHAR(255),
            montant_attribue       NUMERIC(15,2),
            source                 VARCHAR(10)   NOT NULL DEFAULT 'saisie',
            created_at             VARCHAR(50)   NOT NULL,
            updated_at             VARCHAR(50)   NOT NULL,
            updated_by             VARCHAR(36),
            CONSTRAINT ck_ao_suivi_nature CHECK (nature_marche IN
                ('travaux', 'fournitures', 'services', 'etudes', 'gardiennage_nettoyage')),
            CONSTRAINT ck_ao_suivi_statut CHECK (statut_final IN
                ('en_attente', 'retenu', 'non_retenu', 'infructueux', 'annule'))
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS ao_offres_concurrentes (
            id               VARCHAR(36)   PRIMARY KEY,
            ao_id            VARCHAR(36)   NOT NULL REFERENCES appels_offres(id) ON DELETE CASCADE,
            nom              VARCHAR(255)  NOT NULL,
            est_nous         BOOLEAN       NOT NULL DEFAULT FALSE,
            montant_lu       NUMERIC(15,2),
            montant_corrige  NUMERIC(15,2),
            statut           VARCHAR(30)   NOT NULL DEFAULT 'en_attente',
            motif            TEXT,
            note_technique   NUMERIC(5,2),
            ordre            INTEGER       NOT NULL DEFAULT 0,
            created_at       VARCHAR(50)   NOT NULL,
            CONSTRAINT ck_offre_statut CHECK (statut IN
                ('en_attente', 'admis', 'ecarte_administratif', 'ecarte_technique'))
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_offres_concurrentes_ao ON ao_offres_concurrentes (ao_id, ordre)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS ao_offres_concurrentes")
    op.execute("DROP TABLE IF EXISTS ao_suivi")
