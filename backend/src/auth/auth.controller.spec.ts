import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { NativeAuthService } from './native-auth.service';
import { MobileSessionService } from './mobile-session.service';
import { PermissionsService } from '../permissions/permissions.service';
import { User } from '../users/entities/user.entity';

describe('AuthController', () => {
  let controller: AuthController;
  const auth = {
    login: jest.fn(async () => ({ accessToken: 'a', refreshToken: 'r' })),
    logout: jest.fn(async () => undefined),
  };
  const mobileSessions = {
    createSessionFromCredentials: jest.fn(async () => ({
      token: 'mobile-token',
      expires_at: '2026-08-11T00:00:00.000Z',
      session_uuid: 'session-a',
    })),
    revokeSession: jest.fn(async () => undefined),
  };
  const permissions = {
    listAllSlugs: jest.fn(async () => ['clientes.ver']),
    listEffectiveForRole: jest.fn(async () => ['pedidos.ver']),
  };
  const userRepo = {
    findOne: jest.fn(async () => ({ nome: 'Ana Vendedora' })),
  };

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: NativeAuthService, useValue: auth },
        { provide: MobileSessionService, useValue: mobileSessions },
        { provide: PermissionsService, useValue: permissions },
        { provide: getRepositoryToken(User), useValue: userRepo },
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
    expect(result).toMatchObject({ permissions: ['pedidos.ver'], nome: 'Ana Vendedora' });
  });

  // Etapa 4: o bypass hardcoded pra role.name==='admin' foi removido — admin
  // agora depende de tenant_role_permissions igual qualquer outra role.
  it('no longer fabricates the full permission list for local admin role', async () => {
    const result = await controller.me(
      { sub: 'user-a', email: 'a@b.c', roles: ['admin'], tenantId: 'tenant-a' } as any,
      { localUser: { tenantId: 'tenant-a', roleId: 9, role: { name: 'admin' } } } as any,
    );

    expect(permissions.listEffectiveForRole).toHaveBeenCalledWith('tenant-a', 9);
    expect(permissions.listAllSlugs).not.toHaveBeenCalled();
    expect(result).toMatchObject({ permissions: ['pedidos.ver'] });
  });

  it('creates a mobile session through the unified auth controller', async () => {
    const result = await controller.createMobileSession({
      email: 'mobile@renowa.com',
      senha: 'strong-password',
      device_info: 'Hermes',
    });

    expect(mobileSessions.createSessionFromCredentials).toHaveBeenCalledWith(
      'mobile@renowa.com',
      'strong-password',
      'Hermes',
    );
    expect(result).toEqual({
      data: expect.objectContaining({
        token: 'mobile-token',
        session_uuid: 'session-a',
      }),
    });
  });
});
