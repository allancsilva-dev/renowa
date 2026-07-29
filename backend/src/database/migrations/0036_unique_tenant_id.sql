-- Alvo exigido por toda FK composta de tenant `(tenant_id, x) -> (tenant_id, id)`.
-- Estas tabelas são anteriores ao padrão de 0021_cross_tenant_foreign_keys.sql e
-- nunca receberam o índice: a FK simplesmente não pode ser criada contra elas
-- ("there is no unique constraint matching given keys", SQLSTATE 42830), e o
-- atalho de referenciar só `id` abriria referência cross-tenant.
--
-- Do ponto de vista de unicidade o índice é redundante (`id` já é PK); ele existe
-- para ser alvo de FK. Ver PROB-0073 / BACKLOG-0052.
--
-- `pii_audit_events` e `mobile_sessions` são de escrita alta e pagam um índice a
-- mais por INSERT. O escopo "todas as nove" foi decidido em favor da uniformidade
-- do invariante, que passa a ser verificado por `db:verify`.

CREATE UNIQUE INDEX IF NOT EXISTS uq_comissoes_tenant_id_id
  ON public.comissoes (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_financeiro_movimentacao_tenant_id_id
  ON public.financeiro_movimentacao (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inadimplencia_tenant_id_id
  ON public.inadimplencia (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lgpd_requests_tenant_id_id
  ON public.lgpd_requests (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_local_users_tenant_id_id
  ON public.local_users (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mobile_sessions_tenant_id_id
  ON public.mobile_sessions (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_parceiros_comerciais_tenant_id_id
  ON public.parceiros_comerciais (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pii_audit_events_tenant_id_id
  ON public.pii_audit_events (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_role_permissions_tenant_id_id
  ON public.tenant_role_permissions (tenant_id, id);
