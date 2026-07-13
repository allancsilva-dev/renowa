CREATE TABLE IF NOT EXISTS public.lgpd_requests (
  id bigserial PRIMARY KEY,
  request_uuid uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  tenant_id uuid NOT NULL,
  subject_type varchar(32) NOT NULL CHECK (subject_type IN ('CLIENT')),
  subject_uuid uuid NOT NULL,
  request_type varchar(32) NOT NULL CHECK (request_type IN ('ERASURE','EXPORT')),
  status varchar(32) NOT NULL DEFAULT 'RECEIVED' CHECK (status IN (
    'RECEIVED','IDENTITY_VERIFIED','APPROVED','IN_PROGRESS','COMPLETED','DENIED','FAILED'
  )),
  requested_by uuid NOT NULL,
  reviewed_by uuid,
  reason text,
  legal_basis text,
  failure_reason text,
  result jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  UNIQUE (tenant_id, request_uuid)
);

CREATE INDEX IF NOT EXISTS idx_lgpd_requests_tenant_status
  ON public.lgpd_requests (tenant_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lgpd_active_request
  ON public.lgpd_requests (tenant_id, subject_type, subject_uuid, request_type)
  WHERE status NOT IN ('COMPLETED','DENIED','FAILED');

COMMENT ON TABLE public.lgpd_requests IS
  'State machine idempotente para direitos de titulares. Prazos e bases legais dependem de política jurídica aprovada.';
