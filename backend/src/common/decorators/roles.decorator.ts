import { SetMetadata } from '@nestjs/common';

export type Role = 'ADMIN' | 'VENDEDOR' | 'FINANCEIRO' | 'GESTAO';
export const ROLES_KEY = 'roles';

/**
 * @Roles — exige que o usuário tenha AO MENOS UMA das roles listadas.
 *
 * Roles disponíveis: ADMIN, VENDEDOR, FINANCEIRO, GESTAO
 *
 * Uso:
 * @Roles('ADMIN', 'GESTAO')   // ADMIN ou GESTAO podem acessar
 * @Roles('ADMIN')             // apenas ADMIN
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
