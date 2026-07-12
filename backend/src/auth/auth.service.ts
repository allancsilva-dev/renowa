import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MobileSessionService } from './mobile-session.service';
import { CreateMobileSessionDto, MobileSessionResponseDto } from './dto/mobile-session.dto';
import { Public } from '../common/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';

// ──────────────────────────────────────────────────────────
// Controller do fluxo mobile — coexiste com AuthController (web) no prefixo 'auth'.
// ──────────────────────────────────────────────────────────
@Controller('auth')
export class AuthControllerImpl {
  constructor(private readonly mobileSessions: MobileSessionService) {}

  /**
   * POST /api/auth/mobile-session
   *
   * Auth nativa: recebe email+senha, valida credenciais e retorna
   * token HS256 de 30 dias para uso mobile offline.
   */
  @Public()
  @Post('mobile-session')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async createMobileSession(
    @Body() dto: CreateMobileSessionDto,
  ): Promise<{ data: MobileSessionResponseDto }> {
    const result = await this.mobileSessions.createSessionFromCredentials(
      dto.email,
      dto.senha,
      dto.device_info,
    );
    return { data: result };
  }
}
