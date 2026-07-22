import { ForbiddenException } from '@nestjs/common';
import { RolesService } from './roles.service';

function makeService(role: any) {
  const tenantRoleRepo = {
    findOne: jest.fn().mockResolvedValue(role),
    save: jest.fn(async (x: any) => x),
    softDelete: jest.fn().mockResolvedValue(undefined),
  };
  const tenantRolePermissionRepo = {
    find: jest.fn().mockResolvedValue([]),
    manager: { transaction: async (cb: any) => cb({ getRepository: () => tenantRolePermissionRepo }) },
    delete: jest.fn().mockResolvedValue(undefined),
    create: (x: any) => x,
    save: jest.fn().mockResolvedValue(undefined),
  };
  const permissionRepo = { find: jest.fn().mockResolvedValue([]) };
  const service = new RolesService(
    tenantRoleRepo as any, tenantRolePermissionRepo as any, permissionRepo as any,
  );
  return { service, tenantRoleRepo };
}

describe('RolesService — proteção de role de sistema (is_system)', () => {
  const systemRole = {
    id: 1, uuid: 'admin-uuid', tenantId: 't-1', name: 'admin',
    description: 'Role administrativa padrão', active: true, isSystem: true,
  };
  const customRole = {
    id: 2, uuid: 'vendas-uuid', tenantId: 't-1', name: 'vendas',
    description: null, active: true, isSystem: false,
  };

  it('recusa renomear a role admin', async () => {
    const { service } = makeService(systemRole);
    await expect(
      service.updateRole('t-1', 'admin-uuid', { name: 'superadmin' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite editar a descrição da role admin sem tocar no nome', async () => {
    const { service } = makeService(systemRole);
    const result = await service.updateRole('t-1', 'admin-uuid', { description: 'nova descrição' } as any);
    expect(result.description).toBe('nova descrição');
    expect(result.isSystem).toBe(true);
  });

  it('recusa excluir a role admin', async () => {
    const { service } = makeService(systemRole);
    await expect(service.deleteRole('t-1', 'admin-uuid')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('recusa editar as permissões da role admin', async () => {
    const { service } = makeService(systemRole);
    await expect(
      service.updateRolePermissions('t-1', 'admin-uuid', ['clientes.ver']),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite renomear, excluir e editar permissões de uma role comum', async () => {
    const { service, tenantRoleRepo } = makeService(customRole);

    await expect(
      service.updateRole('t-1', 'vendas-uuid', { name: 'comercial' } as any),
    ).resolves.toMatchObject({ name: 'comercial', isSystem: false });

    await expect(service.deleteRole('t-1', 'vendas-uuid')).resolves.toBeUndefined();
    expect(tenantRoleRepo.softDelete).toHaveBeenCalledWith({ id: 2 });

    await expect(
      service.updateRolePermissions('t-1', 'vendas-uuid', []),
    ).resolves.toMatchObject({ isSystem: false });
  });
});
