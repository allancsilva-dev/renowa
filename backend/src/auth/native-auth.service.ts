import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { PasswordService } from './password.service';
import { AccessTokenService } from './access-token.service';
import { RefreshTokenService } from './refresh-token.service';

interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

const LOCKOUT_BACKOFF_MINUTES: Record<number, number> = { 5: 1, 6: 5, 7: 15 };
const MAX_BACKOFF_MINUTES = 60;

@Injectable()
export class NativeAuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly passwords: PasswordService,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  async login(email: string, senha: string, meta: RequestMeta) {
    const user = await this.userRepo.findOne({
      where: { email, is_active: true, deleted_at: IsNull() },
    });

    // Anti-enumeração: mesmo custo/tempo aproximado quando o usuário não existe.
    if (!user || !user.senha_hash) {
      await this.passwords.dummyVerify(senha);
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (user.locked_until && user.locked_until.getTime() > Date.now()) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const ok = await this.passwords.verify(user.senha_hash, senha);
    if (!ok) {
      await this.registerFailure(user);
      throw new UnauthorizedException('Credenciais inválidas');
    }

    await this.userRepo.update(user.id, {
      failed_login_attempts: 0,
      locked_until: null,
      last_login_at: new Date(),
    });

    return this.issuePair(user.uuid, user.tenant_id, user.roles, user.email, user.id, meta);
  }

  async refresh(rawRefresh: string, meta: RequestMeta) {
    const rotated = await this.refreshTokens.rotate(rawRefresh, meta);
    const user = await this.userRepo.findOne({
      where: { id: rotated.userId, is_active: true, deleted_at: IsNull() },
    });
    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    const accessToken = this.accessTokens.sign({
      sub: user.uuid,
      tenantId: user.tenant_id,
      roles: user.roles,
      email: user.email,
    });
    return { accessToken, refreshToken: rotated.token };
  }

  async logout(rawRefresh: string): Promise<void> {
    await this.refreshTokens.revokeFamilyByRawToken(rawRefresh);
  }

  async changePassword(
    userSub: string,
    tenantId: string,
    current: string,
    next: string,
  ): Promise<void> {
    const user = await this.userRepo.findOne({
      where: { uuid: userSub, tenant_id: tenantId, deleted_at: IsNull() },
    });
    if (!user || !user.senha_hash || !(await this.passwords.verify(user.senha_hash, current))) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    const hash = await this.passwords.hash(next);
    await this.userRepo.update(user.id, { senha_hash: hash });
    await this.refreshTokens.revokeAllForUser(user.id);
  }

  private async issuePair(
    sub: string,
    tenantId: string,
    roles: string[],
    email: string,
    userId: number,
    meta: RequestMeta,
  ) {
    const accessToken = this.accessTokens.sign({ sub, tenantId, roles, email });
    const { token: refreshToken } = await this.refreshTokens.issue({
      userId,
      tenantId,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });
    return { accessToken, refreshToken };
  }

  private async registerFailure(user: User): Promise<void> {
    const attempts = user.failed_login_attempts + 1;
    const minutes =
      attempts >= 8 ? MAX_BACKOFF_MINUTES : LOCKOUT_BACKOFF_MINUTES[attempts];
    const patch: Partial<User> = { failed_login_attempts: attempts };
    if (minutes) {
      patch.locked_until = new Date(Date.now() + minutes * 60_000);
    }
    await this.userRepo.update(user.id, patch);
  }
}
