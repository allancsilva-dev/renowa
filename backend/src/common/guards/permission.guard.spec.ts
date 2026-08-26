import { ForbiddenException } from '@nestjs/common';
import { PermissionGuard } from './permission.guard';
import {
  PermissionMode,
  REQUIRED_PERMISSION_KEY,
  REQUIRED_PERMISSION_MODE_KEY,
} from '../decorators/require-permission.decorator';

describe('PermissionGuard', () => {
  const context = (user: object, localUser?: object) => ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user, localUser }) }),
  }) as never;

  // O reflector responde POR CHAVE: sem isso, a metadata de modo receberia a
  // própria lista de permissões e o teste de OR provaria outra coisa.
  const guardFor = (
    required: string | string[],
    listEffectiveForRole: jest.Mock,
    mode?: PermissionMode,
  ) => new PermissionGuard(
    {
      getAllAndOverride: (key: string) => {
        if (key === REQUIRED_PERMISSION_KEY) return required;
        if (key === REQUIRED_PERMISSION_MODE_KEY) return mode;
        return undefined;
      },
    } as never,
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

  // Revogação: o guard não sabe se o perfil ainda existe — quem sabe é
  // `PermissionsService.listEffectiveForRole`, que passou a exigir role viva.
  // Perfil excluído devolve zero slugs, e o guard tem de negar sem exceção.
  it('denies when the role was deleted (listEffectiveForRole resolves empty)', async () => {
    const listEffectiveForRole = jest.fn().mockResolvedValue([]);
    const guard = guardFor('clientes.ver', listEffectiveForRole);
    const localUser = { tenantId: 'tenant-a', roleId: 9, active: true };

    await expect(
      guard.canActivate(context({ tenantId: 'tenant-a', roles: ['vendas'] }, localUser)),
    ).resolves.toBe(false);
  });

  // Usuário desativado carrega access token válido até expirar. Sem esta
  // checagem, ele seguia autorizado durante toda a janela do token.
  it('denies an inactive local user before touching permissions', async () => {
    const listEffectiveForRole = jest.fn().mockResolvedValue(['clientes.ver']);
    const guard = guardFor('clientes.ver', listEffectiveForRole);
    const localUser = { tenantId: 'tenant-a', roleId: 5, active: false };

    await expect(
      guard.canActivate(context({ tenantId: 'tenant-a', roles: ['vendas'] }, localUser)),
    ).resolves.toBe(false);
    expect(listEffectiveForRole).not.toHaveBeenCalled();
  });

  it('still allows an active local user (active: true is not required to be absent)', async () => {
    const listEffectiveForRole = jest.fn().mockResolvedValue(['clientes.ver']);
    const guard = guardFor('clientes.ver', listEffectiveForRole);
    const localUser = { tenantId: 'tenant-a', roleId: 5, active: true };

    await expect(
      guard.canActivate(context({ tenantId: 'tenant-a', roles: ['vendas'] }, localUser)),
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

  /**
   * Modo OR (`RequireAnyPermission`). Motivado pelo `PUT` da foto do produto:
   * definir a foto é parte de criar E de editar, e com AND puro quem tinha só
   * `produtos.criar` cadastrava o produto e tomava 403 na foto do mesmo fluxo.
   */
  describe('modo any', () => {
    const localUser = { tenantId: 'tenant-a', roleId: 5, role: { name: 'vendedor' } };
    const req = context({ tenantId: 'tenant-a', roles: ['vendedor'] }, localUser);

    it('basta UMA das permissões da lista', async () => {
      const guard = guardFor(
        ['produtos.criar', 'produtos.editar'],
        jest.fn().mockResolvedValue(['produtos.criar']),
        'any',
      );

      await expect(guard.canActivate(req)).resolves.toBe(true);
    });

    it('nenhuma delas continua sendo 403', async () => {
      const guard = guardFor(
        ['produtos.criar', 'produtos.editar'],
        jest.fn().mockResolvedValue(['produtos.ver']),
        'any',
      );

      await expect(guard.canActivate(req)).resolves.toBe(false);
    });

    // A garantia que protege todas as rotas já escritas: sem metadata de modo,
    // lista continua significando AND.
    it('sem metadata de modo, a mesma lista exige TODAS', async () => {
      const guard = guardFor(
        ['produtos.criar', 'produtos.editar'],
        jest.fn().mockResolvedValue(['produtos.criar']),
      );

      await expect(guard.canActivate(req)).resolves.toBe(false);
    });

    it('modo all explícito também exige todas', async () => {
      const guard = guardFor(
        ['produtos.criar', 'produtos.editar'],
        jest.fn().mockResolvedValue(['produtos.criar', 'produtos.editar']),
        'all',
      );

      await expect(guard.canActivate(req)).resolves.toBe(true);
    });
  });
});
