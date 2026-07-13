import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { MobileSession } from './entities/mobile-session.entity';
import { RequestUser } from '../common/types/jwt-payload.type';
import { User } from '../users/entities/user.entity';
import { PasswordService } from './password.service';

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
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly config: ConfigService,
    private readonly passwords: PasswordService,
  ) {
    this.secret = this.config.getOrThrow<string>('RENOWA_JWT_SECRET');
  }

  /**
   * Auth nativa: valida credenciais (email+senha) e emite JWT HS256 de 30 dias
   * para uso mobile offline.
   */
  async createSessionFromCredentials(
    email: string,
    senha: string,
    deviceInfo?: string,
  ): Promise<{ token: string; user: { uuid: string; nome: string; roles: string[]; tenantId: string } }> {
    const user = await this.userRepo.findOne({
      where: { email, is_active: true, deleted_at: IsNull() },
    });

    // Anti-enumeração: mesmo tempo aproximado quando o usuário não existe.
    if (!user || !user.senha_hash) {
      await this.passwords.dummyVerify(senha);
      throw new UnauthorizedException('Credenciais inválidas');
    }
    if (!(await this.passwords.verify(user.senha_hash, senha))) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 dias

    const session = await this.sessionRepo.save(
      this.sessionRepo.create({
        tenant_id: user.tenant_id,
        user_uuid: user.uuid,
        token_version: 1,
        device_info: deviceInfo ?? null,
        expires_at: expiresAt,
        last_seen_at: new Date(),
        is_active: true,
      }),
    );

    const tokenPayload: MobileTokenPayload = {
      sub: user.uuid,
      tenantId: user.tenant_id,
      roles: user.roles,
      plan: '',
      tokenVersion: session.token_version,
      sessionUuid: session.uuid,
      type: 'mobile',
    };

    const token = jwt.sign(tokenPayload, this.secret, { expiresIn: '30d' });

    return {
      token,
      user: {
        uuid: user.uuid,
        nome: user.nome,
        roles: user.roles,
        tenantId: user.tenant_id,
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
      payload = jwt.verify(token, this.secret, { algorithms: ['HS256'] }) as MobileTokenPayload;
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
