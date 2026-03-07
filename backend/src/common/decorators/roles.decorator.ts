import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** Exige que o usuário tenha pelo menos uma das roles listadas. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
