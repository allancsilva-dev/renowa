const ADMIN_ROLE = 'admin';

export function normalizeRole(role: string): string {
  return role.trim().toLowerCase();
}

export function normalizeRoles(roles: readonly string[] | undefined): string[] {
  if (!roles) return [];

  return [...new Set(roles.map(normalizeRole).filter(Boolean))];
}

/** Rótulos amigáveis para os papéis conhecidos (chave em lowercase). */
const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  superadmin: 'Super administrador',
  viewer: 'Visualizador',
  gerente: 'Gerente',
  vendedor: 'Vendedor',
  financeiro: 'Financeiro',
  operador: 'Operador',
};

/**
 * Formata um papel para exibição. Papéis conhecidos usam rótulo próprio;
 * papéis custom (por tenant) caem no title-case (`equipe_vendas` → `Equipe Vendas`).
 */
export function formatRole(role: string): string {
  const normalized = normalizeRole(role);
  if (!normalized) return '';
  if (ROLE_LABELS[normalized]) return ROLE_LABELS[normalized];
  return normalized
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
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
