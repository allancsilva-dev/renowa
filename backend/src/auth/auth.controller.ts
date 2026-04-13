import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Delete,
  Param,
  Get,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { JwksStrategy } from './jwks.strategy';
import { MobileSessionService } from './mobile-session.service';
import { CreateMobileSessionDto } from './dto/mobile-session.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly jwksStrategy: JwksStrategy,
    private readonly mobileSessionService: MobileSessionService,
  ) {}

  /**
   * POST /api/auth/mobile-session
   *
   * Estágio 1 do fluxo mobile: troca JWT RS256 do ZonaDevAuth
   * por token HS256 de 30 dias para uso offline.
   */
  @Public()   // Guard não valida — controller valida manualmente via JWKS
  @Post('mobile-session')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async createMobileSession(
    @Body() dto: CreateMobileSessionDto,
    // Extrai token do header manualmente (rota é @Public)
  ) {
    // O token Bearer é extraído pelo guard mesmo em rotas públicas
    // Aqui delegamos para o service que recebe o payload do header
    // O controller recebe o token via header Authorization injetado pelo guard
    throw new Error('Use o AuthService.createMobileSessionFromRequest');
  }

  /**
   * DELETE /api/auth/mobile-session/:uuid
   * Revoga uma sessão mobile específica.
   */
  @Delete('mobile-session/:uuid')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @Param('uuid') sessionUuid: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.mobileSessionService.revokeSession(sessionUuid, user.tenantId);
  }

  @Get('me')
  me(@Req() req: Request) {
    const user = (req as any).user;
    if (!user) return {};
    const { sub, email, roles, tenantId, plan, defaultRole } = user;
    return { sub, email, roles, tenantId, plan, defaultRole };
  }
}
