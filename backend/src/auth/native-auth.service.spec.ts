import { UnauthorizedException } from '@nestjs/common';
import { NativeAuthService } from './native-auth.service';
import { PasswordService } from './password.service';
import { User } from '../users/entities/user.entity';

function makeUserRepo(user: Partial<User> | null) {
  const state = user ? ({ ...user } as User) : null;
  return {
    state,
    findOne: async () => state,
    update: async (_id: number, patch: Partial<User>) => {
      if (state) Object.assign(state, patch);
    },
  };
}

describe('NativeAuthService.login', () => {
  const pwd = new PasswordService();
  const access = { sign: () => 'access.jwt' } as any;
  const refresh = { issue: async () => ({ token: 'refresh.raw' }) } as any;

  it('returns tokens for valid credentials and resets counters', async () => {
    const hash = await pwd.hash('correta');
    const repo = makeUserRepo({
      id: 1, uuid: 'u-1', tenant_id: 't-1', email: 'a@b.c', roles: ['admin'],
      is_active: true, senha_hash: hash, failed_login_attempts: 2, locked_until: null,
    });
    const svc = new NativeAuthService(repo as any, pwd, access, refresh);
    const out = await svc.login('a@b.c', 'correta', {});
    expect(out.accessToken).toBe('access.jwt');
    expect(out.refreshToken).toBe('refresh.raw');
    expect(repo.state!.failed_login_attempts).toBe(0);
  });

  it('rejects wrong password with generic 401 and increments counter', async () => {
    const hash = await pwd.hash('correta');
    const repo = makeUserRepo({
      id: 1, uuid: 'u-1', tenant_id: 't-1', email: 'a@b.c', roles: ['admin'],
      is_active: true, senha_hash: hash, failed_login_attempts: 0, locked_until: null,
    });
    const svc = new NativeAuthService(repo as any, pwd, access, refresh);
    await expect(svc.login('a@b.c', 'errada', {})).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repo.state!.failed_login_attempts).toBe(1);
  });

  it('rejects unknown email with generic 401', async () => {
    const repo = makeUserRepo(null);
    const svc = new NativeAuthService(repo as any, pwd, access, refresh);
    await expect(svc.login('nope@b.c', 'x', {})).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when account is locked', async () => {
    const hash = await pwd.hash('correta');
    const repo = makeUserRepo({
      id: 1, uuid: 'u-1', tenant_id: 't-1', email: 'a@b.c', roles: ['admin'],
      is_active: true, senha_hash: hash, failed_login_attempts: 5,
      locked_until: new Date(Date.now() + 60_000),
    });
    const svc = new NativeAuthService(repo as any, pwd, access, refresh);
    await expect(svc.login('a@b.c', 'correta', {})).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
