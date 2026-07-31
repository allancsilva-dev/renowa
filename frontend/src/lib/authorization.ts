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

export function hasPermission(
  roles: readonly string[] | undefined,
  permissions: readonly string[],
  slug: string,
): boolean {
  return isAdmin(roles) || permissions.includes(slug);
}
