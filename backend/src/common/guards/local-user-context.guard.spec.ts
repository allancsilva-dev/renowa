import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LocalUserContextGuard } from './local-user-context.guard';
import { UsersService } from '../../users/users.service';
import { LocalUser } from '../../rbac/entities/local-user.entity';

describe('LocalUserContextGuard (PROB-0057)', () => {
  const localUser = { id: 7, tenantId: 'tenant-a' } as LocalUser;

  function montar(overrides: Partial<Record<keyof UsersService, jest.Mock>> = {}) {
    const users = {
      findAnyLocalUserByAuthUserId: jest.fn().mockResolvedValue(null),
      findLocalUserByAuthUserIdAndTenant: jest.fn().mockResolvedValue(localUser),
      touchLocalUserLastLogin: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    } as unknown as UsersService;

    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector;
    return { guard: new LocalUserContextGuard(reflector, users), users, reflector };
  }

  function contexto(user: unknown): { ctx: ExecutionContext; req: Record<string, unknown> } {
    const req: Record<string, unknown> = { user };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;
    return { ctx, req };
  }

  it('anexa req.localUser quando existe', async () => {
    const { guard, users } = montar();
    const { ctx, req } = contexto({ sub: 'u1', tenantId: 'tenant-a' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.localUser).toBe(localUser);
    expect(users.touchLocalUserLastLogin).toHaveBeenCalledWith(7);
  });

  // O caso que PROB-0057 descreve: tenant sem nenhuma tenant_role provisionada,
  // primeiro request de usuário sem local_user.
  it('nega com 403 explicável em vez de criar usuário (fail-closed)', async () => {
    const { guard, users } = montar({
      findLocalUserByAuthUserIdAndTenant: jest.fn().mockResolvedValue(null),
    });
    const { ctx, req } = contexto({ sub: 'u-novo', tenantId: 'tenant-vazio' });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(ctx)).rejects.toThrow(/administrador precisa criá-lo/i);
    expect(req.localUser).toBeUndefined();
    expect(users.touchLocalUserLastLogin).not.toHaveBeenCalled();
    // Não pode existir nenhuma via de criação implícita de usuário.
    expect((users as unknown as Record<string, unknown>).createLocalUser).toBeUndefined();
  });

  it('bloqueia local_user de outro tenant', async () => {
    const { guard } = montar({
      findAnyLocalUserByAuthUserId: jest.fn().mockResolvedValue({ tenantId: 'tenant-b' }),
    });
    const { ctx } = contexto({ sub: 'u1', tenantId: 'tenant-a' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(/Tenant mismatch/);
  });

  it('exige tenantId no JWT', async () => {
    const { guard } = montar();
    const { ctx } = contexto({ sub: 'u1' });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('libera rota pública sem tocar no banco', async () => {
    const { guard, users, reflector } = montar();
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    const { ctx } = contexto(undefined);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(users.findAnyLocalUserByAuthUserId).not.toHaveBeenCalled();
  });
});
