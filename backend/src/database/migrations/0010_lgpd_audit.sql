CREATE TABLE IF NOT EXISTS public.pii_audit_events (
  id bigserial PRIMARY KEY,
  event_uuid uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  tenant_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  actor_roles text[] NOT NULL DEFAULT '{}',
  action varchar(32) NOT NULL CHECK (action IN ('READ','CREATE','UPDATE','DELETE','EXPORT','AUDIT_READ')),
  resource_type varchar(64) NOT NULL,
  resource_uuid uuid,
  fields text[] NOT NULL DEFAULT '{}',
  purpose varchar(120) NOT NULL,
  correlation_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_pii_audit_tenant_time
  ON public.pii_audit_events (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pii_audit_tenant_resource
  ON public.pii_audit_events (tenant_id, resource_type, resource_uuid);

REVOKE UPDATE, DELETE, TRUNCATE ON public.pii_audit_events FROM PUBLIC;

COMMENT ON TABLE public.pii_audit_events IS
  'Trilha append-only de acesso e alteração de PII. Nunca armazena valores de PII.';
