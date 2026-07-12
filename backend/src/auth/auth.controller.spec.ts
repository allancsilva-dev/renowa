import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { NativeAuthService } from './native-auth.service';
import { MobileSessionService } from './mobile-session.service';

describe('AuthController', () => {
  let controller: AuthController;
  const auth = {
    login: jest.fn(async () => ({ accessToken: 'a', refreshToken: 'r' })),
    logout: jest.fn(async () => undefined),
  };
  const mobileSessions = { revokeSession: jest.fn(async () => undefined) };

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: NativeAuthService, useValue: auth },
        { provide: MobileSessionService, useValue: mobileSessions },
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
});
