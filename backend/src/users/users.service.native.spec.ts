import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PasswordService } from '../auth/password.service';

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
