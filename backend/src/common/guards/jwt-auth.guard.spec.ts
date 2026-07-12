import { Reflector } from '@nestjs/core';
import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

function ctxFor(req: any) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => null,
    getClass: () => null,
  } as any;
}

describe('JwtAuthGuard', () => {
  const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
  const access = {
    verify: (t: string) => {
      if (t === 'good') return { sub: 'u-1', tenantId: 't-1', roles: ['admin'] };
      throw new Error('bad');
    },
  } as any;
  const mobile = { validateSessionToken: async () => { throw new Error('no'); } } as any;
  const guard = new JwtAuthGuard(reflector, access, mobile);

  it('accepts a valid native access cookie', async () => {
    const req: any = { cookies: { renowa_at: 'good' }, headers: {} };
    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req.user.sub).toBe('u-1');
  });

  it('rejects when no token present', async () => {
    const req: any = { cookies: {}, headers: {} };
    await expect(guard.canActivate(ctxFor(req))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
