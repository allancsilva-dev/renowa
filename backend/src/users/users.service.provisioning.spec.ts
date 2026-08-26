import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_SLUGS, ROLE_TEMPLATE_NAMES } from '@renowa/shared';
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

    const svc = new UsersService(
      { findOne: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any, {} as any, {} as any,
      new PasswordService(), dataSource, {} as any,
    );

    await svc.createTenantUser('t-1', {
      email: 'a@b.c', nome: 'A', senha: 'senha1234', role: 'admin',
    } as any);

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

  /**
   * Era aqui que o defeito entrava: nome fora do template virava tenant_role
   * real e vazia, o usuário logava e tomava 403 em todo endpoint sem nada
   * apontar a causa. A tela de Usuários oferecia justamente dois desses nomes
   * (`manager`, `viewer`), e `viewer` era o default do formulário.
   */
  it('recusa nome fora do template que não existe no tenant, sem criar role vazia', async () => {
    const permissionInsert = jest.fn().mockResolvedValue(undefined);
    const manager = fakeManager({ permissionInsert });
    const dataSource = { transaction: async (cb: any) => cb(manager) } as any;

    const svc = new UsersService(
      { findOne: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any, {} as any, {} as any,
      new PasswordService(), dataSource, {} as any,
    );

    await expect(svc.createTenantUser('t-1', {
      email: 'e@b.c', nome: 'E', senha: 'senha1234', role: 'viewer',
    } as any)).rejects.toThrow(BadRequestException);

    expect(manager.tenantRoleRepo.save).not.toHaveBeenCalled();
    expect(permissionInsert).not.toHaveBeenCalled();
  });

  it('a mensagem de recusa lista os modelos disponíveis', async () => {
    const manager = fakeManager({});
    const dataSource = { transaction: async (cb: any) => cb(manager) } as any;

    const svc = new UsersService(
      { findOne: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any, {} as any, {} as any,
      new PasswordService(), dataSource, {} as any,
    );

    await expect(svc.createTenantUser('t-1', {
      email: 'e@b.c', nome: 'E', senha: 'senha1234', role: 'manager',
    } as any)).rejects.toThrow(new RegExp(ROLE_TEMPLATE_NAMES.join(', ')));
  });

  /** Perfil sob medida criado na tela de Perfis continua atribuível. */
  it('aceita perfil que já existe no tenant mesmo sem template', async () => {
    const permissionInsert = jest.fn().mockResolvedValue(undefined);
    const manager = fakeManager({
      existingRole: { id: 7, tenantId: 't-1', name: 'equipe_vendas', active: true, isSystem: false },
      permissionInsert,
    });
    const dataSource = { transaction: async (cb: any) => cb(manager) } as any;

    const svc = new UsersService(
      { findOne: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any, {} as any, {} as any,
      new PasswordService(), dataSource, {} as any,
    );

    const created = await svc.createTenantUser('t-1', {
      email: 'q@b.c', nome: 'Q', senha: 'senha1234', role: 'Equipe_Vendas',
    } as any);

    expect(created.role).toBe('equipe_vendas');
    expect(manager.tenantRoleRepo.save).not.toHaveBeenCalled();
    expect(permissionInsert).not.toHaveBeenCalled();
  });

  it('reaproveita a role existente sem regravar permissões', async () => {
    const permissionInsert = jest.fn().mockResolvedValue(undefined);
    const manager = fakeManager({
      existingRole: { id: 5, tenantId: 't-1', name: 'admin', active: true, isSystem: true },
      permissionInsert,
    });
    const dataSource = { transaction: async (cb: any) => cb(manager) } as any;

    const svc = new UsersService(
      { findOne: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any, {} as any, {} as any,
      new PasswordService(), dataSource, {} as any,
    );

    await svc.createTenantUser('t-1', {
      email: 'a@b.c', nome: 'A', senha: 'senha1234', role: 'admin',
    } as any);

    expect(manager.tenantRoleRepo.save).not.toHaveBeenCalled();
    expect(permissionInsert).not.toHaveBeenCalled();
  });
});

describe('UsersService — corrida de criação de role (23505)', () => {
  it('não reaproveita uma role soft-deleted ao resolver a corrida', async () => {
    // O catch de 23505 relê a role que o outro processo criou. Sem o filtro
    // `active: true`, o UNIQUE parcial (que só vale para deleted_at IS NULL)
    // deixava a releitura devolver um perfil já excluído — e o usuário novo
    // nascia vinculado a ele.
    const manager = fakeManager({
      tenantRoleSave: jest.fn().mockRejectedValue({ code: '23505' }),
      existingRole: { id: 99, name: 'vendedor', active: true },
    });
    const dataSource = { transaction: async (cb: any) => cb(manager) } as any;

    const svc = new UsersService(
      { findOne: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any, {} as any, {} as any,
      new PasswordService(), dataSource, {} as any,
    );

    await svc.createTenantUser('t-1', {
      email: 'a@b.c', nome: 'A', senha: 'senha1234', role: 'vendedor',
    } as any);

    const rereadCall = manager.tenantRoleRepo.findOne.mock.calls.at(-1)[0];
    expect(rereadCall.where).toMatchObject({ tenantId: 't-1', name: 'vendedor', active: true });
  });
});

describe('UsersService.getCurrentUserContext — só leitura (PROB-0057)', () => {
  it('recusa com 403 quando não existe local_user, em vez de criar um', async () => {
    const localUserRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      save: jest.fn(),
    };

    const svc = new UsersService(
      {} as any, localUserRepo as any, {} as any, {} as any,
      new PasswordService(), {} as any, {} as any,
    );

    await expect(svc.getCurrentUserContext({ authUserId: 'auth-1', tenantId: 't-1' }))
      .rejects.toThrow(ForbiddenException);

    expect(localUserRepo.save).not.toHaveBeenCalled();
  });

  it('devolve perfil e permissões do local_user existente', async () => {
    const localUserRepo = {
      findOne: jest.fn().mockResolvedValue({
        uuid: 'local-1', authUserId: 'auth-1', email: 'a@b.c', tenantId: 't-1', active: true,
        role: {
          name: 'vendedor',
          rolePermissions: [
            { permission: { slug: 'clientes.ver' } },
            { permission: { slug: 'clientes.ver' } },
            { permission: { slug: 'pedidos.criar' } },
          ],
        },
      }),
    };

    const svc = new UsersService(
      {} as any, localUserRepo as any, {} as any, {} as any,
      new PasswordService(), {} as any, {} as any,
    );

    const context = await svc.getCurrentUserContext({ authUserId: 'auth-1', tenantId: 't-1' });

    expect(context.user.role).toBe('vendedor');
    expect(context.permissions).toEqual(['clientes.ver', 'pedidos.criar']);
  });
});
