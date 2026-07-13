import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { RefreshToken } from './entities/refresh-token.entity';

export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ROTATION_GRACE_MS = 10_000;

@Injectable()
export class RefreshTokenService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly repo: Repository<RefreshToken>,
  ) {}

  static hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  async issue(input: {
    userId: number;
    tenantId: string;
    familyId?: string;
    userAgent?: string;
    ip?: string;
  }): Promise<{ token: string }> {
    return this.issueWithRepository(this.repo, input);
  }

  private async issueWithRepository(repo: Repository<RefreshToken>, input: {
    userId: number;
    tenantId: string;
    familyId?: string;
    userAgent?: string;
    ip?: string;
  }): Promise<{ token: string }> {
    const raw = randomBytes(64).toString('base64url');
    const row = repo.create({
      tenant_id: input.tenantId,
      token_hash: RefreshTokenService.hashToken(raw),
      user_id: input.userId,
      family_id: input.familyId ?? randomUUID(),
      expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      revoked_at: null,
      replaced_by_id: null,
      user_agent: input.userAgent ?? null,
      ip: input.ip ?? null,
    });
    await repo.save(row);
    return { token: raw };
  }

  async rotate(
    rawToken: string,
    meta: { userAgent?: string; ip?: string },
  ): Promise<{ token: string; userId: number; tenantId: string }> {
    return this.repo.manager.transaction((manager) => this.rotateLocked(manager, rawToken, meta));
  }

  private async rotateLocked(manager: EntityManager, rawToken: string, meta: { userAgent?: string; ip?: string }) {
    const repo = manager.getRepository(RefreshToken);
    const current = await repo.createQueryBuilder('token')
      .setLock('pessimistic_write')
      .where('token.token_hash = :hash', { hash: RefreshTokenService.hashToken(rawToken) })
      .getOne();

    if (!current) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    // Reuso de token já revogado = indício de roubo → revoga a família toda.
    if (current.revoked_at) {
      if (Date.now() - current.revoked_at.getTime() >= ROTATION_GRACE_MS) {
        await repo.update({ family_id: current.family_id }, { revoked_at: new Date() });
      }
      throw new UnauthorizedException('Refresh token reutilizado');
    }

    if (current.expires_at.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expirado');
    }

    const next = await this.issueWithRepository(repo, {
      userId: current.user_id,
      tenantId: current.tenant_id,
      familyId: current.family_id,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });

    const replacement = await repo.findOne({
      where: { token_hash: RefreshTokenService.hashToken(next.token) },
    });
    current.revoked_at = new Date();
    current.replaced_by_id = replacement?.id ?? null;
    await repo.save(current);

    return { token: next.token, userId: current.user_id, tenantId: current.tenant_id };
  }

  async revokeFamilyByRawToken(rawToken: string): Promise<void> {
    const current = await this.repo.findOne({
      where: { token_hash: RefreshTokenService.hashToken(rawToken) },
    });
    if (current) {
      await this.repo.update({ family_id: current.family_id }, { revoked_at: new Date() });
    }
  }

  async revokeAllForUser(userId: number): Promise<void> {
    await this.repo.update({ user_id: userId }, { revoked_at: new Date() });
  }
}
