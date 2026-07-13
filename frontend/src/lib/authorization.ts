const ADMIN_ROLE = 'admin';

export function normalizeRole(role: string): string {
  return role.trim().toLowerCase();
}

export function normalizeRoles(roles: readonly string[] | undefined): string[] {
  if (!roles) return [];

  return [...new Set(roles.map(normalizeRole).filter(Boolean))];
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
