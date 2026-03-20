-- =============================================================================
-- Renowa — Migration 003: novo modelo RBAC por tenant
-- Tabelas: tenant_roles, local_users, tenant_role_permissions
-- =============================================================================

CREATE TABLE IF NOT EXISTS tenant_roles (
  id SERIAL PRIMARY KEY,
  uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT uq_tenant_roles_tenant_name UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS local_users (
  id SERIAL PRIMARY KEY,
  uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  auth_user_id UUID NOT NULL,
  email VARCHAR(255) NOT NULL,
  role_id INT NOT NULL REFERENCES tenant_roles(id),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT uq_local_users_auth_user_tenant UNIQUE (auth_user_id, tenant_id)
);

CREATE TABLE IF NOT EXISTS tenant_role_permissions (
  id SERIAL PRIMARY KEY,
  role_id INT NOT NULL REFERENCES tenant_roles(id) ON DELETE CASCADE,
  permission_slug VARCHAR(100) NOT NULL REFERENCES permissions(slug) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_role_permissions_role_permission UNIQUE (role_id, permission_slug)
);

CREATE INDEX IF NOT EXISTS idx_tenant_roles_tenant_id ON tenant_roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_roles_tenant_active ON tenant_roles(tenant_id, active);

CREATE INDEX IF NOT EXISTS idx_local_users_tenant_id ON local_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_local_users_tenant_active ON local_users(tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_local_users_tenant_role ON local_users(tenant_id, role_id);

CREATE INDEX IF NOT EXISTS idx_tenant_role_permissions_role_id ON tenant_role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_tenant_role_permissions_slug ON tenant_role_permissions(permission_slug);

CREATE TRIGGER trg_tenant_roles_updated_at
  BEFORE UPDATE ON tenant_roles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_local_users_updated_at
  BEFORE UPDATE ON local_users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
