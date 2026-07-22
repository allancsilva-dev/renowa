-- Fluxo Comercial Completo (Fase 2): completa o catálogo de permissões
-- (fonte da verdade em shared/src/permissions/catalog.ts) com os 3 slugs
-- novos do ciclo pedido->faturamento->comissão, e concede às roles de
-- sistema/negócio pertinentes. Segue exatamente o padrão de
-- 0025_permission_catalog_and_system_role.sql.
INSERT INTO public.permissions (slug, description, module) VALUES
  ('pedidos.liberar', 'Liberar pedidos para faturamento', 'pedidos'),
  ('faturamento.ver', 'Visualizar faturamento', 'faturamento'),
  ('faturamento.editar', 'Registrar e editar notas fiscais de faturamento', 'faturamento')
ON CONFLICT (slug) DO NOTHING;

-- admin/gestao: recebem o catálogo inteiro em DEFAULT_ROLE_PERMISSIONS
-- (shared/catalog.ts), então as 3 permissões novas entram inteiras aqui
-- também. LOWER(tr.name) é defesa adicional independente de case (roles.name
-- é gravado em lowercase pelo código de provisionamento via
-- normalizeRoleName, mas o dado real já observado no banco de dev tem
-- inconsistência de case em outras roles — ver relatório).
-- tr.deleted_at IS NULL: nunca conceder permissão a uma role soft-deleted.
INSERT INTO public.tenant_role_permissions (tenant_id, role_id, permission_slug)
SELECT tr.tenant_id, tr.id, p.slug
FROM public.tenant_roles tr
CROSS JOIN public.permissions p
WHERE tr.deleted_at IS NULL
  AND LOWER(tr.name) IN ('admin', 'gestao')
  AND p.slug IN ('pedidos.liberar', 'faturamento.ver', 'faturamento.editar')
ON CONFLICT (tenant_id, role_id, permission_slug) DO NOTHING;

-- financeiro: visualiza/libera pedidos + faturamento completo (spec
-- shared/catalog.spec.ts). pedidos.ver entra aqui também — se a role já
-- tivesse essa concessão (não deveria, permissão pré-existente que não
-- fazia parte do papel financeiro), ON CONFLICT DO NOTHING cobre o caso.
INSERT INTO public.tenant_role_permissions (tenant_id, role_id, permission_slug)
SELECT tr.tenant_id, tr.id, p.slug
FROM public.tenant_roles tr
CROSS JOIN public.permissions p
WHERE tr.deleted_at IS NULL
  AND LOWER(tr.name) = 'financeiro'
  AND p.slug IN ('pedidos.ver', 'pedidos.liberar', 'faturamento.ver', 'faturamento.editar')
ON CONFLICT (tenant_id, role_id, permission_slug) DO NOTHING;
