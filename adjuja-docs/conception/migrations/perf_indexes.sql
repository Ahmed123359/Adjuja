-- Migration de performance - 2026-07-02
-- Indexes qui NE PEUVENT PAS etre crees automatiquement par SQLAlchemy create_all
-- (index GIN tsvector, partial index, index sur schema watcher)
--
-- Executer UNE SEULE FOIS sur la base de prod :
--   psql $DATABASE_URL -f perf_indexes.sql
--
-- Tous les index sont CREATE INDEX IF NOT EXISTS : sans danger si deja appliques.

-- ============================================================
-- 1. Recherche full-text sur scraped_aos (watcher)
-- ============================================================
-- Remplace les ILIKE '%search%' qui causent des full table scans.
-- L'index GIN sur le tsvector combine titre + acheteur.
-- Utilisation dans repository.py : remplacer ilike par @@

CREATE INDEX IF NOT EXISTS idx_scraped_aos_fts
ON watcher.scraped_aos
USING gin(
  to_tsvector('french', coalesce(titre, '') || ' ' || coalesce(acheteur, ''))
);

-- ============================================================
-- 2. Partial index sur newsletter_subscribers.active
-- ============================================================
-- La requete batch fait toujours WHERE active = TRUE.
-- Un index B-tree sur boolean a une faible selectivite (50/50),
-- mais un PARTIAL index ne couvre que les lignes actives (~100%)
-- et est tres petit et rapide.

CREATE INDEX IF NOT EXISTS idx_newsletter_active
ON newsletter_subscribers (email)
WHERE active = TRUE;

-- ============================================================
-- 3. Index sur users.verification_token (complement ORM)
-- ============================================================
-- Deja ajoute dans models.py (index=True) pour les nouveaux deploiements.
-- Sur une base existante, create_all ne modifie pas les colonnes :
-- cet index doit etre cree manuellement.

CREATE INDEX IF NOT EXISTS idx_users_verification_token
ON users (verification_token)
WHERE verification_token IS NOT NULL;

-- ============================================================
-- Verification post-migration
-- ============================================================
-- SELECT indexname, indexdef FROM pg_indexes
-- WHERE tablename IN ('scraped_aos','newsletter_subscribers','users')
-- ORDER BY tablename, indexname;
