import { ConfigService } from '@nestjs/config';
import { AccessTokenService } from './access-token.service';

describe('AccessTokenService', () => {
  const config = { getOrThrow: () => 'test-at-secret' } as unknown as ConfigService;
  const users = { findOne: jest.fn() } as any;
  const svc = new AccessTokenService(config, users);

  it('signs and verifies, preserving RequestUser shape', async () => {
    users.findOne.mockResolvedValue({ access_token_version: 3 });
    const token = svc.sign({ sub: 'u-1', tenantId: 't-1', roles: ['admin'], email: 'a@b.c', tokenVersion: 3 });
    const user = await svc.verify(token);
    expect(user.sub).toBe('u-1');
    expect(user.tenantId).toBe('t-1');
    expect(user.roles).toEqual(['admin']);
    expect(user.email).toBe('a@b.c');
    expect(typeof user.jti).toBe('string');
    expect(user.tokenVersion).toBe(3);
  });

  it('throws on tampered token', async () => {
    await expect(svc.verify('not.a.jwt')).rejects.toThrow();
  });

  it('rejects a token after its persisted version changes', async () => {
    users.findOne.mockResolvedValue({ access_token_version: 4 });
    const token = svc.sign({ sub: 'u-1', tenantId: 't-1', roles: ['admin'], email: 'a@b.c', tokenVersion: 3 });
    await expect(svc.verify(token)).rejects.toThrow('access token revoked');
  });
});
