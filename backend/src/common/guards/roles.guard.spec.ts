import { ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const context = (roles: string[]) => ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
  }) as never;

  it('accepts native lowercase admin role for ADMIN metadata', () => {
    const guard = new RolesGuard({ getAllAndOverride: () => ['ADMIN'] } as never);
    expect(guard.canActivate(context(['admin']))).toBe(true);
  });

  it('rejects non-admin role', () => {
    const guard = new RolesGuard({ getAllAndOverride: () => ['ADMIN'] } as never);
    expect(() => guard.canActivate(context(['viewer']))).toThrow(ForbiddenException);
  });
});
