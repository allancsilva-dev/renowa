import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { TenantRole } from '../rbac/entities/tenant-role.entity';
import { TenantRolePermission } from '../rbac/entities/tenant-role-permission.entity';
import { LocalUser } from '../rbac/entities/local-user.entity';

function makeService(role: any, opts: { usersInRole?: number; grantedPermissions?: number } = {}) {
  const tenantRolePermissionRepo: any = {
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(opts.grantedPermissions ?? 0),
    delete: jest.fn().mockResolvedValue(undefined),
    create: (x: any) => x,
    insert: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const localUserRepo = {
    count: jest.fn().mockResolvedValue(opts.usersInRole ?? 0),
  };
  const tenantRoleRepo: any = {
    findOne: jest.fn().mockResolvedValue(role),
    save: jest.fn(async (x: any) => x),
    softDelete: jest.fn().mockResolvedValue(undefined),
  };

  // O manager roteia por entity — deleteRole/updateRole tocam três repositórios
  // diferentes na mesma transação, e um mock que devolve sempre o mesmo repo
  // esconderia exatamente o que estes testes existem para provar.
  const query = jest.fn().mockResolvedValue(undefined);
  const manager = {
    query,
    getRepository: (entity: any) => {
      if (entity === TenantRole) return tenantRoleRepo;
      if (entity === LocalUser) return localUserRepo;
      if (entity === TenantRolePermission) return tenantRolePermissionRepo;
      throw new Error(`repositório não mapeado no mock: ${entity?.name}`);
    },
  };
  tenantRoleRepo.manager = { transaction: async (cb: any) => cb(manager) };
  tenantRolePermissionRepo.manager = tenantRoleRepo.manager;

  const permissionRepo = { find: jest.fn().mockResolvedValue([]) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new RolesService(
    tenantRoleRepo as any, tenantRolePermissionRepo as any, permissionRepo as any, audit as any,
  );
  return { service, tenantRoleRepo, tenantRolePermissionRepo, localUserRepo, audit, query };
}

const systemRole = {
  id: 1, uuid: 'admin-uuid', tenantId: 't-1', name: 'admin',
  description: 'Role administrativa padrão', active: true, isSystem: true,
};
const customRole = () => ({
  id: 2, uuid: 'vendas-uuid', tenantId: 't-1', name: 'vendas',
  description: null, active: true, isSystem: false,
});

describe('RolesService — proteção de role de sistema (is_system)', () => {
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
    const { service, tenantRoleRepo } = makeService(customRole());

    await expect(
      service.updateRole('t-1', 'vendas-uuid', { name: 'comercial' } as any),
    ).resolves.toMatchObject({ name: 'comercial', isSystem: false });

    await expect(service.deleteRole('t-1', 'vendas-uuid')).resolves.toBeUndefined();
    expect(tenantRoleRepo.softDelete).toHaveBeenCalledWith({ id: 2 });

    await expect(
      service.updateRolePermissions('t-1', 'vendas-uuid', []),
    ).resolves.toMatchObject({ isSystem: false });
  });

  it('registra auditoria em update/delete/updatePermissions quando o actor é informado', async () => {
    const { service, audit } = makeService(customRole());
    const actor = { sub: 'user-1', roles: ['manager'] } as any;

    await service.updateRole('t-1', 'vendas-uuid', { description: 'nova' } as any, actor);
    await service.deleteRole('t-1', 'vendas-uuid', actor);
    await service.updateRolePermissions('t-1', 'vendas-uuid', [], actor);

    expect(audit.record).toHaveBeenCalledTimes(3);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE', resourceType: 'tenant_role' }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE', resourceType: 'tenant_role' }));
  });

  it('não registra auditoria quando nenhum actor é informado', async () => {
    const { service, audit } = makeService(customRole());

    await service.updateRole('t-1', 'vendas-uuid', { description: 'nova' } as any);
    await service.deleteRole('t-1', 'vendas-uuid');

    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('RolesService — excluir perfil revoga acesso de fato', () => {
  it('recusa com 409 quando há usuário ativo vinculado, sem tocar em nada', async () => {
    const { service, tenantRoleRepo, tenantRolePermissionRepo, localUserRepo } =
      makeService(customRole(), { usersInRole: 3 });

    await expect(service.deleteRole('t-1', 'vendas-uuid')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.deleteRole('t-1', 'vendas-uuid')).rejects.toThrow(/3 usuário\(s\)/);

    expect(localUserRepo.count).toHaveBeenCalledWith({
      where: { tenantId: 't-1', roleId: 2, active: true },
    });
    // Recusa não pode ter efeito colateral nenhum.
    expect(tenantRolePermissionRepo.delete).not.toHaveBeenCalled();
    expect(tenantRoleRepo.softDelete).not.toHaveBeenCalled();
  });

  it('apaga os vínculos de permissão junto com o soft-delete quando ninguém está vinculado', async () => {
    const { service, tenantRoleRepo, tenantRolePermissionRepo } =
      makeService(customRole(), { usersInRole: 0, grantedPermissions: 7 });

    await service.deleteRole('t-1', 'vendas-uuid');

    // Soft-delete não dispara o ON DELETE CASCADE da FK: sem este delete
    // explícito, as permissões sobrevivem ao perfil.
    expect(tenantRolePermissionRepo.delete).toHaveBeenCalledWith({ tenantId: 't-1', roleId: 2 });
    expect(tenantRoleRepo.softDelete).toHaveBeenCalledWith({ id: 2 });
  });

  it('registra na auditoria quantas permissões foram revogadas', async () => {
    const { service, audit } = makeService(customRole(), { usersInRole: 0, grantedPermissions: 7 });
    const actor = { sub: 'user-1', roles: ['admin'] } as any;

    await service.deleteRole('t-1', 'vendas-uuid', actor);

    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'DELETE',
      fields: ['active', 'permissions'],
      metadata: { revokedPermissionCount: 7 },
    }));
  });
});

describe('RolesService — renomear perfil propaga para usuarios.roles', () => {
  it('atualiza o jsonb e incrementa access_token_version dos vinculados', async () => {
    const { service, query } = makeService(customRole());

    await service.updateRole('t-1', 'vendas-uuid', { name: 'Comercial' } as any);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/UPDATE usuarios/);
    expect(sql).toMatch(/access_token_version = access_token_version \+ 1/);
    expect(sql).toMatch(/FROM local_users/);
    // Nome normalizado, não o que veio na request.
    expect(params).toEqual(['t-1', 2, 'comercial']);
  });

  it('não toca em usuarios.roles quando só a descrição muda', async () => {
    const { service, query } = makeService(customRole());

    await service.updateRole('t-1', 'vendas-uuid', { description: 'nova' } as any);

    expect(query).not.toHaveBeenCalled();
  });

  it('recusa nome já usado por outra role antes de propagar', async () => {
    const { service, tenantRoleRepo, query } = makeService(customRole());
    tenantRoleRepo.findOne
      .mockResolvedValueOnce(customRole())
      .mockResolvedValueOnce({ uuid: 'outra-uuid', name: 'comercial' });

    await expect(
      service.updateRole('t-1', 'vendas-uuid', { name: 'comercial' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });
});
