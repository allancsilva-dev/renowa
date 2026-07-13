import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { RequestUser } from '../common/types/jwt-payload.type';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';

interface AccessTokenClaims {
  sub: string;
  tenantId: string;
  roles: string[];
  email: string;
  jti: string;
  type: 'access';
  tokenVersion: number;
}

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

@Injectable()
export class AccessTokenService {
  private readonly secret: string;

  constructor(config: ConfigService, @InjectRepository(User) private readonly users: Repository<User>) {
    this.secret = config.getOrThrow<string>('RENOWA_AT_SECRET');
  }

  sign(input: { sub: string; tenantId: string; roles: string[]; email: string; tokenVersion: number }): string {
    const claims: AccessTokenClaims = {
      sub: input.sub,
      tenantId: input.tenantId,
      roles: input.roles,
      email: input.email,
      jti: randomUUID(),
      type: 'access',
      tokenVersion: input.tokenVersion,
    };
    return jwt.sign(claims, this.secret, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
  }

  async verify(token: string): Promise<RequestUser> {
    const claims = jwt.verify(token, this.secret, { algorithms: ['HS256'] }) as AccessTokenClaims;
    if (claims.type !== 'access') {
      throw new Error('invalid token type');
    }
    const user = await this.users.findOne({
      where: { uuid: claims.sub, tenant_id: claims.tenantId, is_active: true, deleted_at: IsNull() },
      select: { access_token_version: true },
    });
    if (!user || user.access_token_version !== claims.tokenVersion) {
      throw new Error('access token revoked');
    }
    return {
      sub: claims.sub,
      tenantId: claims.tenantId,
      tenantSubdomain: '',
      roles: claims.roles,
      plan: '',
      tokenVersion: claims.tokenVersion,
      jti: claims.jti,
      email: claims.email,
    };
  }
}
