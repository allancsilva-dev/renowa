import { UnauthorizedException } from '@nestjs/common';
import { RefreshTokenService } from './refresh-token.service';
import { RefreshToken } from './entities/refresh-token.entity';

/** Repo TypeORM em memória mínimo para o serviço. */
function makeRepo() {
  const rows: RefreshToken[] = [];
  let seq = 1;
  return {
    rows,
    create: (data: Partial<RefreshToken>) => ({ ...data }) as RefreshToken,
    save: async (r: RefreshToken) => {
      if (!r.id) {
        r.id = seq++;
        rows.push(r);
      }
      return r;
    },
    findOne: async ({ where }: any) =>
      rows.find((r) => r.token_hash === where.token_hash) ?? null,
    update: async (criteria: any, patch: any) => {
      rows
        .filter(
          (r) =>
            (criteria.family_id ? r.family_id === criteria.family_id : r.id === criteria.id) &&
            (criteria.user_id ? r.user_id === criteria.user_id : true),
        )
        .forEach((r) => Object.assign(r, patch));
    },
  };
}

describe('RefreshTokenService', () => {
  it('issues and rotates a token', async () => {
    const repo = makeRepo();
    const svc = new RefreshTokenService(repo as any);
    const { token } = await svc.issue({ userId: 1, tenantId: 't-1' });
    const rotated = await svc.rotate(token, {});
    expect(rotated.userId).toBe(1);
    expect(rotated.token).not.toBe(token);
    // token antigo agora está revogado
    const old = repo.rows.find((r) => r.token_hash === RefreshTokenService.hashToken(token))!;
    expect(old.revoked_at).toBeTruthy();
  });

  it('detects reuse and revokes the whole family', async () => {
    const repo = makeRepo();
    const svc = new RefreshTokenService(repo as any);
    const { token } = await svc.issue({ userId: 1, tenantId: 't-1' });
    await svc.rotate(token, {}); // primeira rotação: token vira revogado
    await expect(svc.rotate(token, {})).rejects.toBeInstanceOf(UnauthorizedException); // reuso
    // toda a família revogada
    expect(repo.rows.every((r) => r.revoked_at)).toBe(true);
  });
});
