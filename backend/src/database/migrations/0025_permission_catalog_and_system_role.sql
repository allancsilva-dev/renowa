-- Etapa 2 do RBAC overhaul: completa o catálogo de permissões (fonte da
-- verdade em shared/src/permissions/catalog.ts) e marca papéis de sistema.

-- Novos slugs (auditoria.ver, privacidade.gerenciar) — hoje audit.controller.ts
-- e privacy.controller.ts usam RolesGuard/@Roles('ADMIN'); estes slugs
-- existem pra Etapa 4 poder migrar os dois pra PermissionGuard.
INSERT INTO public.permissions (slug, description, module) VALUES
  ('auditoria.ver', 'Visualizar trilha de auditoria', 'auditoria'),
  ('privacidade.gerenciar', 'Gerenciar solicitações de privacidade (LGPD)', 'privacidade')
ON CONFLICT (slug) DO NOTHING;

-- Marca papéis de sistema (hoje só "admin"). Etapa 4 usa esta coluna pra
-- recusar rename/delete do perfil admin sem depender de comparar string.
ALTER TABLE public.tenant_roles ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

UPDATE public.tenant_roles SET is_system = true WHERE name = 'admin' AND NOT is_system;

-- Backfill: hoje o PermissionGuard faz bypass hardcoded pra role.name='admin',
-- então tenant_role_permissions nunca precisou ter linha pra admin. A Etapa 4
-- remove esse bypass — sem este backfill, todo tenant admin perderia acesso
-- no deploy seguinte. Concede explicitamente TODAS as permissões do catálogo
-- pra cada papel de sistema já existente.
INSERT INTO public.tenant_role_permissions (tenant_id, role_id, permission_slug)
SELECT tr.tenant_id, tr.id, p.slug
FROM public.tenant_roles tr
CROSS JOIN public.permissions p
WHERE tr.is_system
ON CONFLICT (tenant_id, role_id, permission_slug) DO NOTHING;

-- Índice parcial: hoje UNIQUE(tenant_id, name) é cheio e ignora deleted_at,
-- então recriar um perfil com o mesmo nome depois de excluir (soft-delete)
-- o anterior quebra com violação de unique (roles.service.ts#createRole já
-- busca só entre não-deletados via findOne padrão do TypeORM — o bloqueio
-- é só do constraint do banco).
ALTER TABLE public.tenant_roles DROP CONSTRAINT IF EXISTS "UQ_5ce9009d305dfb90272653e0b53";

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_tenant_roles_tenant_id_name_active"
  ON public.tenant_roles (tenant_id, name)
  WHERE deleted_at IS NULL;
