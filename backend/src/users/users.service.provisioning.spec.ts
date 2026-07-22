import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_SLUGS } from '@renowa/shared';
import { UsersService } from './users.service';
import { PasswordService } from '../auth/password.service';

function fakeManager(overrides: {
  existingRole?: any;
  tenantRoleSave?: jest.Mock;
  permissionInsert?: jest.Mock;
}) {
  const tenantRoleRepo = {
    findOne: jest.fn().mockResolvedValue(overrides.existingRole ?? undefined),
    create: (x: any) => x,
    save: overrides.tenantRoleSave ?? jest.fn(async (x: any) => ({ ...x, id: 10 })),
  };
  const tenantRolePermissionRepo = {
    create: (x: any) => x,
    insert: overrides.permissionInsert ?? jest.fn().mockResolvedValue(undefined),
  };
  // createTenantUser também abre `User` e `LocalUser` na mesma transação —
  // stub genérico só pra esses dois não travarem quem só quer testar o
  // provisionamento da role.
  const passthroughRepo = {
    findOne: jest.fn().mockResolvedValue(undefined),
    create: (x: any) => x,
    save: jest.fn(async (x: any) => ({ ...x, id: 1, uuid: 'u-1' })),
  };
  return {
    getRepository: (entity: any) => {
      if (entity.name === 'TenantRole') return tenantRoleRepo;
      if (entity.name === 'TenantRolePermission') return tenantRolePermissionRepo;
      return passthroughRepo;
    },
    tenantRoleRepo,
    tenantRolePermissionRepo,
  };
}

describe('UsersService — provisionamento explícito de tenant_roles', () => {
  it('provisiona a role admin com is_system=true e todas as permissões do catálogo', async () => {
    const permissionInsert = jest.fn().mockResolvedValue(undefined);
    const manager = fakeManager({ permissionInsert });
    const dataSource = { transaction: async (cb: any) => cb(manager) } as any;

    const localUserRepo = {
      findOne: jest.fn().mockResolvedValue(undefined),
      create: (x: any) => x,
      save: jest.fn(async (x: any) => ({ ...x, id: 1 })),
      findOneOrFail: jest.fn().mockResolvedValue({
        uuid: 'local-1', authUserId: 'auth-1', email: 'a@b.c', tenantId: 't-1', active: true,
        role: { name: 'admin', rolePermissions: [] },
      }),
    };

    const svc = new UsersService(
      {} as any, localUserRepo as any, {} as any, {} as any,
      new PasswordService(), dataSource, {} as any,
    );

    await svc.getCurrentUserContext({
      authUserId: 'auth-1', tenantId: 't-1', email: 'a@b.c', defaultRole: 'admin',
    });

    expect(manager.tenantRoleRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'admin', isSystem: true }),
    );
    const grantedSlugs = permissionInsert.mock.calls[0][0].map((row: any) => row.permissionSlug);
    expect(new Set(grantedSlugs)).toEqual(new Set(PERMISSION_SLUGS));
  });

  it('provisiona vendedor com is_system=false e só o template padrão dele', async () => {
    const permissionInsert = jest.fn().mockResolvedValue(undefined);
    const manager = fakeManager({ permissionInsert });
    const dataSource = { transaction: async (cb: any) => cb(manager) } as any;

    const svc = new UsersService(
      { findOne: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any, {} as any, {} as any,
      new PasswordService(), dataSource, {} as any,
    );

    await svc.createTenantUser('t-1', {
      email: 'v@b.c', nome: 'V', senha: 'senha1234', role: 'vendedor',
    } as any);

    expect(manager.tenantRoleRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'vendedor', isSystem: false }),
    );
    const grantedSlugs = permissionInsert.mock.calls[0][0].map((row: any) => row.permissionSlug);
    expect(new Set(grantedSlugs)).toEqual(new Set(DEFAULT_ROLE_PERMISSIONS.vendedor));
  });

  it('provisiona um nome fora do template sem nenhuma permissão (fail-closed)', async () => {
    const permissionInsert = jest.fn().mockResolvedValue(undefined);
    const manager = fakeManager({ permissionInsert });
    const dataSource = { transaction: async (cb: any) => cb(manager) } as any;

    const svc = new UsersService(
      { findOne: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any, {} as any, {} as any,
      new PasswordService(), dataSource, {} as any,
    );

    await svc.createTenantUser('t-1', {
      email: 'e@b.c', nome: 'E', senha: 'senha1234', role: 'estagiario',
    } as any);

    expect(manager.tenantRoleRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'estagiario', isSystem: false }),
    );
    expect(permissionInsert).not.toHaveBeenCalled();
  });

  it('reaproveita a role existente sem regravar permissões', async () => {
    const permissionInsert = jest.fn().mockResolvedValue(undefined);
    const manager = fakeManager({
      existingRole: { id: 5, tenantId: 't-1', name: 'admin', active: true, isSystem: true },
      permissionInsert,
    });
    const dataSource = { transaction: async (cb: any) => cb(manager) } as any;

    const localUserRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 1, roleId: 5, email: 'a@b.c' }),
      update: jest.fn().mockResolvedValue(undefined),
      findOneOrFail: jest.fn().mockResolvedValue({
        uuid: 'local-1', authUserId: 'auth-1', email: 'a@b.c', tenantId: 't-1', active: true,
        role: { name: 'admin', rolePermissions: [] },
      }),
    };

    const svc = new UsersService(
      {} as any, localUserRepo as any, {} as any, {} as any,
      new PasswordService(), dataSource, {} as any,
    );

    await svc.getCurrentUserContext({
      authUserId: 'auth-1', tenantId: 't-1', email: 'a@b.c', defaultRole: 'admin',
    });

    expect(manager.tenantRoleRepo.save).not.toHaveBeenCalled();
    expect(permissionInsert).not.toHaveBeenCalled();
  });
});
