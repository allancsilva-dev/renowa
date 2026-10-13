import { RequestUser } from '../types/jwt-payload.type';

/**
 * Papel comparado sem caixa. O token carrega o que está gravado e o banco tem
 * as duas formas (`admin`/`ADMIN`, `vendedor`/`VENDEDOR`) — o login nativo
 * grava minúsculo. Comparar com igualdade exata deixava ADMIN sem a ação
 * dele e VENDEDOR em minúsculo sem o filtro de ownership.
 */
export function normalizeRole(role: string): string {
  return String(role ?? '').trim().toUpperCase();
}

export function hasRoleName(user: Pick<RequestUser, 'roles'>, role: string): boolean {
  const target = normalizeRole(role);
  return (user.roles ?? []).some((value) => normalizeRole(value) === target);
}

/**
 * Ações que o negócio reservou ao ADMIN por papel, não por permissão.
 *
 * Permissão não basta nesses casos: `DEFAULT_ROLE_PERMISSIONS` dá o catálogo
 * inteiro também a `gestao` (shared/src/permissions/catalog.ts), então um slug
 * novo chegaria à Gestão sem ninguém decidir isso.
 */
export function isAdmin(user: Pick<RequestUser, 'roles'>): boolean {
  return hasRoleName(user, 'ADMIN');
}
