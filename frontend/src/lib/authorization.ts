import { formatRoleName } from '@renowa/shared';

const ADMIN_ROLE = 'admin';

export function normalizeRole(role: string): string {
  return role.trim().toLowerCase();
}

export function normalizeRoles(roles: readonly string[] | undefined): string[] {
  if (!roles) return [];

  return [...new Set(roles.map(normalizeRole).filter(Boolean))];
}

/**
 * Formata um papel para exibição.
 *
 * A lista de rótulos vive em `@renowa/shared` (`ROLE_TEMPLATES`), junto do mapa
 * de permissões que o backend usa para provisionar o perfil. Este arquivo já
 * teve a sua própria lista — com `gerente` e `operador`, nomes que o backend
 * nunca soube provisionar — e havia ainda uma terceira em `UsuariosPage` e uma
 * quarta em `AuditoriaPage`. Perfil custom (criado na tela de Perfis) cai no
 * title-case: `equipe_vendas` → `Equipe Vendas`.
 *
 * `superadmin` fica aqui porque é papel de plataforma, não `tenant_role`: não
 * tem template de permissões e não aparece na tela de Usuários.
 */
export function formatRole(role: string): string {
  const normalized = normalizeRole(role);
  if (!normalized) return '';
  if (normalized === 'superadmin') return 'Super administrador';
  return formatRoleName(normalized);
}

export function hasRole(roles: readonly string[] | undefined, target: string): boolean {
  const normalizedTarget = normalizeRole(target);
  return normalizedTarget.length > 0
    && (roles?.some((role) => normalizeRole(role) === normalizedTarget) ?? false);
}

export function hasAnyRole(
  userRoles: readonly string[] | undefined,
  requiredRoles: readonly string[],
): boolean {
  return requiredRoles.some((role) => hasRole(userRoles, role));
}

export function isAdmin(roles: readonly string[] | undefined): boolean {
  return hasRole(roles, ADMIN_ROLE);
}

/**
 * Autorização no frontend é decidida pelos slugs que `GET /auth/me` devolve —
 * os mesmos que o `PermissionGuard` do backend consulta.
 *
 * Havia aqui um `isAdmin(roles) ||`: quem tivesse o **nome** de perfil `admin`
 * passava em qualquer check. O backend removeu esse bypass no overhaul de RBAC
 * (e tem teste travando a remoção), então a UI liberava botão que a API
 * recusava com 403. Perfil sob medida chamado `admin`, sem permissão nenhuma,
 * abria o produto inteiro na tela.
 *
 * O admin de sistema continua enxergando tudo porque tem os 32 vínculos reais
 * em `tenant_role_permissions`, não porque se chama `admin`.
 */
export function hasPermission(
  _roles: readonly string[] | undefined,
  permissions: readonly string[],
  slug: string,
): boolean {
  return permissions.includes(slug);
}
