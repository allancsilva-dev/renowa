import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { RequestUser } from '../common/types/jwt-payload.type';

interface AccessTokenClaims {
  sub: string;
  tenantId: string;
  roles: string[];
  email: string;
  jti: string;
  type: 'access';
}

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

@Injectable()
export class AccessTokenService {
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret = config.getOrThrow<string>('RENOWA_AT_SECRET');
  }

  sign(input: { sub: string; tenantId: string; roles: string[]; email: string }): string {
    const claims: AccessTokenClaims = {
      sub: input.sub,
      tenantId: input.tenantId,
      roles: input.roles,
      email: input.email,
      jti: randomUUID(),
      type: 'access',
    };
    return jwt.sign(claims, this.secret, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
  }

  verify(token: string): RequestUser {
    const claims = jwt.verify(token, this.secret) as AccessTokenClaims;
    if (claims.type !== 'access') {
      throw new Error('invalid token type');
    }
    return {
      sub: claims.sub,
      tenantId: claims.tenantId,
      tenantSubdomain: '',
      roles: claims.roles,
      plan: '',
      tokenVersion: 0,
      jti: claims.jti,
      email: claims.email,
    };
  }
}
