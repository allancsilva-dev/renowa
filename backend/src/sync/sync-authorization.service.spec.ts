import { ForbiddenException } from '@nestjs/common';
import { SyncAuthorizationService } from './sync-authorization.service';
import { SyncEntity, SyncOperation } from './dto/sync.dto';

describe('SyncAuthorizationService', () => {
  const permissions = { listEffectiveForRole: jest.fn() };
  const service = new SyncAuthorizationService(permissions as never);
  const user = { tenantId: 'tenant-a', roles: ['manager'] };
  const localUser = {
    tenantId: 'tenant-a', roleId: 7, active: true, role: { name: 'manager' },
  };

  beforeEach(() => jest.clearAllMocks());

  it.each([
    [SyncEntity.CLIENTES, SyncOperation.CREATE, 'clientes.criar'],
    [SyncEntity.CLIENTES, SyncOperation.UPDATE, 'clientes.editar'],
    [SyncEntity.CLIENTES, SyncOperation.DELETE, 'clientes.deletar'],
    [SyncEntity.ITENS_PEDIDO, SyncOperation.CREATE, 'pedidos.editar'],
    [SyncEntity.ITENS_PEDIDO, SyncOperation.DELETE, 'pedidos.editar'],
  ])('maps %s %s to %s', (entity, operation, expected) => {
    expect(service.permissionFor(entity, operation)).toBe(expected);
  });

  it('loads manager permissions once and accepts a mixed authorized batch', async () => {
    permissions.listEffectiveForRole.mockResolvedValue(['clientes.criar', 'pedidos.editar']);
    await expect(service.assertCanPush([
      { entity: SyncEntity.CLIENTES, operation: SyncOperation.CREATE },
      { entity: SyncEntity.ITENS_PEDIDO, operation: SyncOperation.UPDATE },
    ], user as never, localUser as never)).resolves.toBeUndefined();
    expect(permissions.listEffectiveForRole).toHaveBeenCalledTimes(1);
    expect(permissions.listEffectiveForRole).toHaveBeenCalledWith('tenant-a', 7);
  });

  it('rejects the whole batch when manager lacks one exact operation permission', async () => {
    permissions.listEffectiveForRole.mockResolvedValue(['clientes.editar']);
    await expect(service.assertCanPush([
      { entity: SyncEntity.CLIENTES, operation: SyncOperation.UPDATE },
      { entity: SyncEntity.CLIENTES, operation: SyncOperation.DELETE },
    ], user as never, localUser as never)).rejects.toMatchObject({
      response: expect.objectContaining({ denied: ['clientes:DELETE'] }),
    });
  });

  it('rejects viewer mutations', async () => {
    permissions.listEffectiveForRole.mockResolvedValue(['clientes.ver']);
    await expect(service.assertCanPush([
      { entity: SyncEntity.CLIENTES, operation: SyncOperation.UPDATE },
    ], user as never, { ...localUser, role: { name: 'viewer' } } as never)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows SUPERADMIN without querying permissions', async () => {
    await expect(service.assertCanPush([
      { entity: SyncEntity.PRODUTOS, operation: SyncOperation.DELETE },
    ], { ...user, roles: ['SUPERADMIN'] } as never, undefined)).resolves.toBeUndefined();
    expect(permissions.listEffectiveForRole).not.toHaveBeenCalled();
  });

  // Etapa 4: o bypass hardcoded pra role.name==='admin' foi removido — admin
  // agora depende de tenant_role_permissions igual qualquer outra role.
  it('no longer bypasses local admin role — depende de tenant_role_permissions', async () => {
    permissions.listEffectiveForRole.mockResolvedValue(['produtos.deletar']);
    await expect(service.assertCanPush([
      { entity: SyncEntity.PRODUTOS, operation: SyncOperation.DELETE },
    ], user as never, { ...localUser, role: { name: 'admin' } } as never)).resolves.toBeUndefined();
    expect(permissions.listEffectiveForRole).toHaveBeenCalledWith('tenant-a', 7);
  });

  it.each([
    [undefined],
    [{ ...localUser, tenantId: 'tenant-b' }],
    [{ ...localUser, active: false }],
  ])('rejects missing, cross-tenant, or inactive local context', async (context) => {
    await expect(service.assertCanPush([], user as never, context as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(permissions.listEffectiveForRole).not.toHaveBeenCalled();
  });
});
