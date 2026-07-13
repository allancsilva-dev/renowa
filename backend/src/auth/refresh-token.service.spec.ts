import { UnauthorizedException } from '@nestjs/common';
import { RefreshTokenService } from './refresh-token.service';
import { RefreshToken } from './entities/refresh-token.entity';

function makeRepo() {
  const rows: RefreshToken[] = [];
  let seq = 1;
  const repo: any = {
    rows,
    create: (data: Partial<RefreshToken>) => ({ ...data }) as RefreshToken,
    save: async (row: RefreshToken) => {
      if (!row.id) { row.id = seq++; rows.push(row); }
      return row;
    },
    findOne: async ({ where }: any) => rows.find((row) => row.token_hash === where.token_hash) ?? null,
    update: async (criteria: any, patch: any) => {
      rows.filter((row) =>
        (criteria.family_id ? row.family_id === criteria.family_id : row.id === criteria.id) &&
        (criteria.user_id ? row.user_id === criteria.user_id : true),
      ).forEach((row) => Object.assign(row, patch));
    },
    createQueryBuilder: () => {
      let hash = '';
      const builder: any = {
        setLock: () => builder,
        where: (_sql: string, params: { hash: string }) => { hash = params.hash; return builder; },
        getOne: async () => rows.find((row) => row.token_hash === hash) ?? null,
      };
      return builder;
    },
  };
  repo.manager = { transaction: async (callback: any) => callback({ getRepository: () => repo }) };
  return repo;
}

describe('RefreshTokenService', () => {
  it('issues and rotates a token under transaction lock', async () => {
    const repo = makeRepo();
    const service = new RefreshTokenService(repo);
    const { token } = await service.issue({ userId: 1, tenantId: 't-1' });
    const rotated = await service.rotate(token, {});
    expect(rotated.userId).toBe(1);
    expect(rotated.token).not.toBe(token);
    expect(repo.rows.find((row: RefreshToken) => row.token_hash === RefreshTokenService.hashToken(token)).revoked_at).toBeTruthy();
  });

  it('does not revoke the family for a concurrent retry inside grace window', async () => {
    const repo = makeRepo();
    const service = new RefreshTokenService(repo);
    const { token } = await service.issue({ userId: 1, tenantId: 't-1' });
    const rotated = await service.rotate(token, {});
    await expect(service.rotate(token, {})).rejects.toBeInstanceOf(UnauthorizedException);
    const replacement = repo.rows.find((row: RefreshToken) => row.token_hash === RefreshTokenService.hashToken(rotated.token));
    expect(replacement.revoked_at).toBeNull();
  });

  it('revokes the family when reuse occurs after grace window', async () => {
    const repo = makeRepo();
    const service = new RefreshTokenService(repo);
    const { token } = await service.issue({ userId: 1, tenantId: 't-1' });
    await service.rotate(token, {});
    const original = repo.rows.find((row: RefreshToken) => row.token_hash === RefreshTokenService.hashToken(token));
    original.revoked_at = new Date(Date.now() - 11_000);
    await expect(service.rotate(token, {})).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repo.rows.every((row: RefreshToken) => row.revoked_at)).toBe(true);
  });
});
