import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PasswordService } from '../auth/password.service';
import { User } from './entities/user.entity';
import { LocalUser } from '../rbac/entities/local-user.entity';

describe('UsersService.createTenantUser (nativo)', () => {
  it('rejects duplicate email', async () => {
    const manager = {
      getRepository: () => ({
        findOne: async () => ({ id: 1 }), // email já existe
        create: (x: any) => x,
        save: async (x: any) => ({ ...x, id: 1, uuid: 'u' }),
      }),
    };
    const dataSource = { transaction: async (cb: any) => cb(manager) } as any;
    const svc = new UsersService(
      {} as any, {} as any, {} as any, {} as any, new PasswordService(), dataSource, {} as any,
    );
    await expect(
      svc.createTenantUser('t-1', { email: 'a@b.c', nome: 'A', senha: 'senha1234', role: 'admin' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('UsersService.listTenantUsers', () => {
  it('returns the user name instead of exposing only the auth id', async () => {
    const userRepo = {
      find: jest.fn().mockResolvedValue([{ uuid: 'auth-1', nome: 'Maria Silva' }]),
    };
    const localUserRepo = {
      find: jest.fn().mockResolvedValue([{
        uuid: 'local-1', authUserId: 'auth-1', email: 'maria@empresa.com',
        tenantId: 'tenant-1', active: true, role: { name: 'admin' },
      }]),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new UsersService(
      userRepo as any, localUserRepo as any, {} as any, {} as any,
      new PasswordService(), {} as any, audit as any,
    );

    const result = await service.listTenantUsers('tenant-1');

    expect(result[0]).toMatchObject({ name: 'Maria Silva', email: 'maria@empresa.com' });
  });
});

describe('UsersService.updateTenantUser — percentual de comissão', () => {
  it('atualiza pendências históricas zeradas sem invalidar sessões', async () => {
    const existing = {
      id: 10, uuid: 'local-1', authUserId: 'auth-1', email: 'vendedor@empresa.com',
      tenantId: 'tenant-1', active: true, roleId: 2, role: { name: 'vendedor' },
    };
    const localUserRepo = {
      findOne: jest.fn().mockResolvedValue(existing),
      findOneOrFail: jest.fn().mockResolvedValue(existing),
    };
    const managerLocalRepo = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const managerUserRepo = {
      findOneOrFail: jest.fn().mockResolvedValue({ id: 7, percentual_comissao: '0.00' }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      increment: jest.fn(),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) => entity === User ? managerUserRepo : entity === LocalUser ? managerLocalRepo : {}),
      query: jest.fn().mockResolvedValue([]),
    };
    const dataSource = { transaction: jest.fn((work: any) => work(manager)) };
    const service = new UsersService(
      {} as any, localUserRepo as any, {} as any, {} as any,
      new PasswordService(), dataSource as any, {} as any,
    );

    const result = await service.updateTenantUser('tenant-1', 'local-1', { percentual_comissao: 4.5 });

    expect(managerUserRepo.update).toHaveBeenCalledWith(
      { uuid: 'auth-1', tenant_id: 'tenant-1' },
      expect.objectContaining({ percentual_comissao: '4.50' }),
    );
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining("status = 'pendente' AND perc_comissao = 0"), [
      'tenant-1', 7, '4.50',
    ]);
    expect(managerUserRepo.increment).not.toHaveBeenCalled();
    expect(result.percentual_comissao).toBe('4.50');
  });
});
