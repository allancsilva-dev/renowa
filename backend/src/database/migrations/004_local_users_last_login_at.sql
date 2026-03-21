-- =============================================================================
-- Renowa — Migration 004: last_login_at em local_users
-- =============================================================================

ALTER TABLE local_users
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ NULL;
