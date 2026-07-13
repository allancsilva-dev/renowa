-- Torna o escopo tenant explícito na associação role/permissão.
ALTER TABLE tenant_role_permissions
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE tenant_role_permissions trp
SET tenant_id = tr.tenant_id
FROM tenant_roles tr
WHERE tr.id = trp.role_id
  AND trp.tenant_id IS NULL;

ALTER TABLE tenant_role_permissions
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE tenant_role_permissions
  DROP CONSTRAINT IF EXISTS uq_tenant_role_permissions_role_permission;

ALTER TABLE tenant_role_permissions
  DROP CONSTRAINT IF EXISTS "UQ_46a5709120690ca37b81b877ce1";

ALTER TABLE tenant_role_permissions
  DROP CONSTRAINT IF EXISTS uq_tenant_role_permissions_tenant_role_permission;

ALTER TABLE tenant_role_permissions
  ADD CONSTRAINT uq_tenant_role_permissions_tenant_role_permission
  UNIQUE (tenant_id, role_id, permission_slug);

CREATE INDEX IF NOT EXISTS idx_tenant_role_permissions_tenant_role
  ON tenant_role_permissions(tenant_id, role_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_tenant_roles_tenant_id_id'
  ) THEN
    ALTER TABLE tenant_roles
      ADD CONSTRAINT uq_tenant_roles_tenant_id_id UNIQUE (tenant_id, id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_tenant_role_permissions_tenant_role'
  ) THEN
    ALTER TABLE tenant_role_permissions
      ADD CONSTRAINT fk_tenant_role_permissions_tenant_role
      FOREIGN KEY (tenant_id, role_id)
      REFERENCES tenant_roles(tenant_id, id)
      ON DELETE CASCADE;
  END IF;
END $$;
