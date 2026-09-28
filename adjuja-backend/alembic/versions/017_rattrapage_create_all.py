"""Rattrapage : aligner les bases construites par create_all sur les migrations

Jusqu'au 2026-09-27, le schema venait de Base.metadata.create_all au demarrage
de l'application : les migrations n'etaient jamais appliquees (pas de table
alembic_version, ni en dev ni en production). create_all cree les tables
manquantes mais n'ajoute jamais une colonne, un index ou une regle de
suppression a une table existante. En production, appels_offres.mode et
date_limite manquaient (erreur 500 sur le tableau de bord le 2026-09-27).

Cette migration est idempotente (IF NOT EXISTS partout) et sert deux cas :
- base neuve, construite par les migrations 001 a 016 : elle ajoute ce que les
  modeles ont gagne sans migration (newsletter_subscribers,
  company_profiles.lu_et_accepte_minio_key, deux index) ;
- ancienne base create_all, estampillee 016 par app/scripts/migrate.py : elle
  ajoute les colonnes des migrations 011 a 014 si elles manquent, les index, et
  les regles de suppression d'ao_team_members.

Revision ID: 017
Revises: 016
Create Date: 2026-09-27
"""

from alembic import op

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Colonnes des migrations 011 a 014 : absentes d'une base create_all anterieure.
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS entreprise VARCHAR(255) NOT NULL DEFAULT ''")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS secteur_activite VARCHAR(100) NOT NULL DEFAULT ''")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS nb_ao_par_an INTEGER")
    # Nullable ici : NOT NULL echouerait sur des organisations existantes sans proprietaire.
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS owner_id VARCHAR(36) REFERENCES users(id)")
    op.execute("ALTER TABLE appels_offres ADD COLUMN IF NOT EXISTS mode VARCHAR(20) NOT NULL DEFAULT 'express'")
    op.execute("ALTER TABLE appels_offres ADD COLUMN IF NOT EXISTS date_limite VARCHAR(50)")

    # Ajoutes aux modeles sans migration.
    op.execute("ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS lu_et_accepte_minio_key VARCHAR(512)")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS newsletter_subscribers (
            id         VARCHAR(36)  PRIMARY KEY,
            email      VARCHAR(255) NOT NULL,
            active     BOOLEAN      NOT NULL DEFAULT TRUE,
            created_at VARCHAR(50)  NOT NULL,
            CONSTRAINT uq_newsletter_email UNIQUE (email)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_newsletter_subscribers_email ON newsletter_subscribers (email)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_marches_org_id ON marches (org_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_verification_token ON users (verification_token)")

    # Regles de suppression d'ao_team_members. Sans SET NULL, supprimer un CV
    # affecte a une equipe violait la cle etrangere (erreur 500). Les
    # contraintes existantes sont retrouvees par leur definition, leur nom
    # differant selon qu'elles viennent des migrations ou de create_all.
    op.execute(
        """
        DO $$
        DECLARE r record;
        BEGIN
            FOR r IN
                SELECT conname FROM pg_constraint
                WHERE conrelid = 'ao_team_members'::regclass AND contype = 'f'
                  AND (pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (ao_id)%'
                       OR pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (staff_cv_id)%')
            LOOP
                EXECUTE format('ALTER TABLE ao_team_members DROP CONSTRAINT %I', r.conname);
            END LOOP;
        END $$;
        """
    )
    op.execute(
        "ALTER TABLE ao_team_members ADD CONSTRAINT ao_team_members_ao_id_fkey "
        "FOREIGN KEY (ao_id) REFERENCES appels_offres(id) ON DELETE CASCADE"
    )
    op.execute(
        "ALTER TABLE ao_team_members ADD CONSTRAINT ao_team_members_staff_cv_id_fkey "
        "FOREIGN KEY (staff_cv_id) REFERENCES staff_cvs(id) ON DELETE SET NULL"
    )


def downgrade() -> None:
    # Rattrapage sans retour arriere : retirer ces colonnes et index casserait
    # le code, qui les attend. Rien a defaire.
    pass
