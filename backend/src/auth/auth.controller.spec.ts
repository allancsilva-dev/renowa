import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { NativeAuthService } from './native-auth.service';
import { MobileSessionService } from './mobile-session.service';
import { PermissionsService } from '../permissions/permissions.service';

describe('AuthController', () => {
  let controller: AuthController;
  const auth = {
    login: jest.fn(async () => ({ accessToken: 'a', refreshToken: 'r' })),
    logout: jest.fn(async () => undefined),
  };
  const mobileSessions = { revokeSession: jest.fn(async () => undefined) };
  const permissions = {
    listAllSlugs: jest.fn(async () => ['clientes.ver']),
    listEffectiveForRole: jest.fn(async () => ['pedidos.ver']),
  };

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: NativeAuthService, useValue: auth },
        { provide: MobileSessionService, useValue: mobileSessions },
        { provide: PermissionsService, useValue: permissions },
      ],
    }).compile();
    controller = mod.get(AuthController);
  });

  it('login sets both auth cookies', async () => {
    const cookies: Record<string, string> = {};
    const res = { cookie: (name: string, val: string) => { cookies[name] = val; }, clearCookie: jest.fn() } as any;
    const req = { headers: {}, ip: '127.0.0.1' } as any;
    await controller.login({ email: 'a@b.c', senha: 'x' } as any, req, res);
    expect(cookies['renowa_at']).toBe('a');
    expect(cookies['renowa_rt']).toBe('r');
  });

  it('returns tenant-scoped effective permissions from /auth/me', async () => {
    const result = await controller.me(
      { sub: 'user-a', email: 'a@b.c', roles: ['vendedor'], tenantId: 'tenant-a' } as any,
      { localUser: { tenantId: 'tenant-a', roleId: 7, role: { name: 'vendedor' } } } as any,
    );

    expect(permissions.listEffectiveForRole).toHaveBeenCalledWith('tenant-a', 7);
    expect(result).toMatchObject({ permissions: ['pedidos.ver'] });
  });
});
