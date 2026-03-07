import {
  Injectable,
  UnauthorizedException,
  Controller,
  Post,
  Req,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { JwksStrategy } from './jwks.strategy';
import { MobileSessionService } from './mobile-session.service';
import { MobileSessionResponseDto } from './dto/mobile-session.dto';
import { Public } from '../common/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwksStrategy: JwksStrategy,
    private readonly mobileSessionService: MobileSessionService,
  ) {}

  /**
   * Valida JWT RS256 do ZonaDevAuth e cria sessão mobile HS256.
   * Chamado diretamente do controller com acesso ao header.
   */
  async createMobileSessionFromRequest(
    req: Request,
    deviceInfo?: string,
  ): Promise<MobileSessionResponseDto> {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token Bearer não fornecido');
    }

    const token = authHeader.slice(7);
    const payload = await this.jwksStrategy.verify(token);

    return this.mobileSessionService.createSession(payload, deviceInfo);
  }
}

// ──────────────────────────────────────────────────────────
// Controller real — sobrescreve o placeholder em auth.controller.ts
// ──────────────────────────────────────────────────────────
@Controller('auth')
export class AuthControllerImpl {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/auth/mobile-session
   *
   * Recebe JWT RS256 do ZonaDevAuth no header Authorization.
   * Retorna token HS256 de 30 dias para uso mobile offline.
   *
   * CHANGELOG: rota é @Public mas valida o token manualmente via JWKS.
   */
  @Public()
  @Post('mobile-session')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async createMobileSession(
    @Req() req: Request,
    @Body('device_info') deviceInfo?: string,
  ): Promise<{ data: MobileSessionResponseDto }> {
    const result = await this.authService.createMobileSessionFromRequest(req, deviceInfo);
    return { data: result };
  }
}
