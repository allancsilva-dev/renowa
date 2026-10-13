import { RequestUser } from '../types/jwt-payload.type';

/**
 * Ações que o negócio reservou ao ADMIN por papel, não por permissão.
 *
 * Permissão não basta nesses casos: `DEFAULT_ROLE_PERMISSIONS` dá o catálogo
 * inteiro também a `gestao` (shared/src/permissions/catalog.ts), então um slug
 * novo chegaria à Gestão sem ninguém decidir isso.
 */
export function isAdmin(user: Pick<RequestUser, 'roles'>): boolean {
  return user.roles.includes('ADMIN');
}
