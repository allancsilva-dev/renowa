import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, JWTVerifyResult, JWTPayload } from 'jose';
import { JwtPayload } from '../common/types/jwt-payload.type';

/**
 * CHANGELOG #10: Validação JWKS RS256 via biblioteca `jose`.
 * Cache de 5 minutos + cooldown de 30s após erro.
 */
@Injectable()
export class JwksStrategy {
  private readonly JWKS: ReturnType<typeof createRemoteJWKSet>;
  private readonly expectedIss: string;
  private readonly expectedAud: string;

  constructor(private readonly config: ConfigService) {
    this.JWKS = createRemoteJWKSet(
      new URL(this.config.getOrThrow<string>('ZONADEV_JWKS_URL')),
      {
        cacheMaxAge: 5 * 60 * 1000,  // 5 minutos de cache
        cooldownDuration: 30_000,     // 30s antes de re-fetch após erro
      },
    );

    this.expectedIss = this.config.getOrThrow<string>('ZONADEV_EXPECTED_ISS');
    this.expectedAud = this.config.getOrThrow<string>('ZONADEV_EXPECTED_AUD');
  }

  async verify(token: string): Promise<JwtPayload> {
    try {
      const result: JWTVerifyResult<JWTPayload> = await jwtVerify(token, this.JWKS, {
        issuer: this.expectedIss,
        audience: this.expectedAud,
      });

      const payload = result.payload as unknown as JwtPayload;

      // CHANGELOG #7: garantir que roles é sempre array
      if (!Array.isArray(payload.roles)) {
        throw new UnauthorizedException('Token inválido: roles deve ser array');
      }

      return payload;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Token inválido ou expirado');
    }
  }
}
