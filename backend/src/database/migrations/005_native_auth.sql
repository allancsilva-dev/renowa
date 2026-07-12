-- =============================================================================
-- Renowa — Migration 005: autenticação nativa (credenciais + refresh tokens)
-- =============================================================================

-- Credenciais e defesas de login em usuarios
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS senha_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ NULL;

-- Email global único (decisão: 1 tenant de fato). Remove índice não-único antigo.
-- Nota: o nome real do índice antigo é gerado pelo TypeORM; DROP IF EXISTS é no-op se divergir.
DROP INDEX IF EXISTS "IDX_usuarios_tenant_id_email";
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_email ON usuarios (email) WHERE deleted_at IS NULL;

-- Refresh tokens rotativos (multi-tenant: tenant_id NOT NULL)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id           BIGSERIAL PRIMARY KEY,
  uuid         UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  token_hash   TEXT NOT NULL,
  user_id      BIGINT NOT NULL REFERENCES usuarios(id),
  family_id    UUID NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ NULL,
  replaced_by_id BIGINT NULL REFERENCES refresh_tokens(id),
  user_agent   TEXT NULL,
  ip           INET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_refresh_tokens_uuid ON refresh_tokens (uuid);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family_id ON refresh_tokens (family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_tenant_id ON refresh_tokens (tenant_id);
