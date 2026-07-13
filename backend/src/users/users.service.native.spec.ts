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
