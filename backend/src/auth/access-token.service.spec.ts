import { ConfigService } from '@nestjs/config';
import { AccessTokenService } from './access-token.service';

describe('AccessTokenService', () => {
  const config = { getOrThrow: () => 'test-at-secret' } as unknown as ConfigService;
  const svc = new AccessTokenService(config);

  it('signs and verifies, preserving RequestUser shape', () => {
    const token = svc.sign({ sub: 'u-1', tenantId: 't-1', roles: ['admin'], email: 'a@b.c' });
    const user = svc.verify(token);
    expect(user.sub).toBe('u-1');
    expect(user.tenantId).toBe('t-1');
    expect(user.roles).toEqual(['admin']);
    expect(user.email).toBe('a@b.c');
    expect(typeof user.jti).toBe('string');
  });

  it('throws on tampered token', () => {
    expect(() => svc.verify('not.a.jwt')).toThrow();
  });
});
