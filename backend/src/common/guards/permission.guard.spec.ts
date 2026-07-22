import { ForbiddenException } from '@nestjs/common';
import { PermissionGuard } from './permission.guard';

describe('PermissionGuard', () => {
  const context = (user: object, localUser?: object) => ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user, localUser }) }),
  }) as never;

  const guardFor = (required: string | string[], listEffectiveForRole: jest.Mock) =>
    new PermissionGuard(
      { getAllAndOverride: () => required } as never,
      { listEffectiveForRole } as never,
    );

  // Achado 1 — RolesController exigindo `usuarios.gerenciar`
  it('denies a manager without usuarios.gerenciar (403 path — canActivate returns false)', async () => {
    const listEffectiveForRole = jest.fn().mockResolvedValue([]);
    const guard = guardFor('usuarios.gerenciar', listEffectiveForRole);
    const localUser = { tenantId: 'tenant-a', roleId: 5, role: { name: 'manager' } };

    await expect(
      guard.canActivate(context({ tenantId: 'tenant-a', roles: ['manager'] }, localUser)),
    ).resolves.toBe(false);
    expect(listEffectiveForRole).toHaveBeenCalledWith('tenant-a', 5);
  });

  // Achado 2 — manager com permissão granular concedida via tenant_role_permissions
  // agora consegue passar (antes o RolesGuard estático bloqueava antes de chegar aqui)
  it('allows a manager with financeiro.ver granted via tenant_role_permissions', async () => {
    const listEffectiveForRole = jest.fn().mockResolvedValue(['financeiro.ver']);
    const guard = guardFor('financeiro.ver', listEffectiveForRole);
    const localUser = { tenantId: 'tenant-a', roleId: 5, role: { name: 'manager' } };

    await expect(
      guard.canActivate(context({ tenantId: 'tenant-a', roles: ['manager'] }, localUser)),
    ).resolves.toBe(true);
  });

  it('allows any request when no permission metadata is declared', async () => {
    const guard = guardFor(undefined as never, jest.fn());
    await expect(guard.canActivate(context({ roles: [] }, undefined))).resolves.toBe(true);
  });

  it('bypasses permission lookup for SUPERADMIN', async () => {
    const listEffectiveForRole = jest.fn();
    const guard = guardFor('usuarios.gerenciar', listEffectiveForRole);

    await expect(
      guard.canActivate(context({ roles: ['SUPERADMIN'] }, undefined)),
    ).resolves.toBe(true);
    expect(listEffectiveForRole).not.toHaveBeenCalled();
  });

  // Etapa 4: o bypass hardcoded pra role.name==='admin' foi removido — admin
  // só passa porque a Etapa 2/3 garantem que tenant_role_permissions tem
  // todo o catálogo pra ele, igual qualquer outra role.
  it('no longer bypasses local admin role — depende de tenant_role_permissions', async () => {
    const listEffectiveForRole = jest.fn().mockResolvedValue([]);
    const guard = guardFor('usuarios.gerenciar', listEffectiveForRole);
    const localUser = { tenantId: 'tenant-a', roleId: 1, role: { name: 'admin' } };

    await expect(
      guard.canActivate(context({ tenantId: 'tenant-a', roles: ['admin'] }, localUser)),
    ).resolves.toBe(false);
    expect(listEffectiveForRole).toHaveBeenCalledWith('tenant-a', 1);
  });

  it('allows admin when tenant_role_permissions grants the required slug', async () => {
    const listEffectiveForRole = jest.fn().mockResolvedValue(['usuarios.gerenciar']);
    const guard = guardFor('usuarios.gerenciar', listEffectiveForRole);
    const localUser = { tenantId: 'tenant-a', roleId: 1, role: { name: 'admin' } };

    await expect(
      guard.canActivate(context({ tenantId: 'tenant-a', roles: ['admin'] }, localUser)),
    ).resolves.toBe(true);
  });

  it('throws when a permission is required but there is no local user context', async () => {
    const guard = guardFor('usuarios.gerenciar', jest.fn());
    await expect(
      guard.canActivate(context({ roles: ['manager'] }, undefined)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
