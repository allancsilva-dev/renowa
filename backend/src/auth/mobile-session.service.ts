import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { MobileSession } from './entities/mobile-session.entity';
import { RequestUser, JwtPayload } from '../common/types/jwt-payload.type';
import { UsersService } from '../users/users.service';

interface MobileTokenPayload {
  sub: string;
  tenantId: string;
  roles: string[];
  plan: string;
  tokenVersion: number;
  sessionUuid: string;
  type: 'mobile';
}

@Injectable()
export class MobileSessionService {
  private readonly secret: string;

  constructor(
    @InjectRepository(MobileSession)
    private readonly sessionRepo: Repository<MobileSession>,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    this.secret = this.config.getOrThrow<string>('RENOWA_JWT_SECRET');
  }

  /**
   * Cria sessão mobile após validação RS256 do ZonaDevAuth.
   * Retorna JWT HS256 de 30 dias.
   */
  async createSession(
    jwsPayload: JwtPayload,
    deviceInfo?: string,
  ): Promise<{ token: string; user: { uuid: string; nome: string; roles: string[]; tenantId: string } }> {
    // Verifica se subscription está ativa (plan não é FREE/SUSPENDED)
    if (!jwsPayload.plan || jwsPayload.plan === 'SUSPENDED') {
      throw new ForbiddenException('Assinatura inativa ou suspensa');
    }

    const user = await this.usersService.findByUuidAndTenant(
      jwsPayload.sub,
      jwsPayload.tenantId,
    );

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 dias

    const session = this.sessionRepo.create({
      tenant_id: jwsPayload.tenantId,
      user_uuid: jwsPayload.sub,
      token_version: 1,
      device_info: deviceInfo ?? null,
      expires_at: expiresAt,
      last_seen_at: new Date(),
      is_active: true,
    });

    const saved = await this.sessionRepo.save(session);

    const tokenPayload: MobileTokenPayload = {
      sub: jwsPayload.sub,
      tenantId: jwsPayload.tenantId,
      roles: jwsPayload.roles,
      plan: jwsPayload.plan,
      tokenVersion: saved.token_version,
      sessionUuid: saved.uuid,
      type: 'mobile',
    };

    const token = jwt.sign(tokenPayload, this.secret, { expiresIn: '30d' });

    return {
      token,
      user: {
        uuid: user.uuid,
        nome: user.nome,
        roles: jwsPayload.roles,
        tenantId: jwsPayload.tenantId,
      },
    };
  }

  /**
   * Valida token de sessão mobile (HS256).
   * Verifica revogação via token_version.
   */
  async validateSessionToken(token: string): Promise<RequestUser> {
    let payload: MobileTokenPayload;

    try {
      payload = jwt.verify(token, this.secret) as MobileTokenPayload;
    } catch {
      throw new UnauthorizedException('Token de sessão mobile inválido');
    }

    if (payload.type !== 'mobile') {
      throw new UnauthorizedException('Tipo de token inválido');
    }

    const session = await this.sessionRepo.findOne({
      where: {
        uuid: payload.sessionUuid,
        tenant_id: payload.tenantId,
        is_active: true,
      },
    });

    if (!session) throw new UnauthorizedException('Sessão não encontrada ou revogada');
    if (session.token_version !== payload.tokenVersion) {
      throw new UnauthorizedException('Sessão revogada');
    }
    if (session.expires_at < new Date()) {
      throw new UnauthorizedException('Sessão expirada');
    }

    // Atualiza last_seen sem bloquear a request
    void this.sessionRepo.update(session.id, { last_seen_at: new Date() });

    return {
      sub: payload.sub,
      tenantId: payload.tenantId,
      tenantSubdomain: '',
      roles: payload.roles,
      plan: payload.plan,
      tokenVersion: payload.tokenVersion,
      jti: payload.sessionUuid,
    };
  }

  async revokeSession(sessionUuid: string, tenantId: string): Promise<void> {
    await this.sessionRepo.update(
      { uuid: sessionUuid, tenant_id: tenantId },
      { is_active: false },
    );
  }
}
