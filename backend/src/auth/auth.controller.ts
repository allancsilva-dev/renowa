import {
  Controller, Post, Get, Delete, Param, Body, Req, Res, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { NativeAuthService } from './native-auth.service';
import { MobileSessionService } from './mobile-session.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  CreateMobileSessionDto,
  MobileSessionResponseDto,
} from './dto/mobile-session.dto';
import { setAuthCookies, clearAuthCookies, RT_COOKIE } from './cookie.util';
import { PermissionsService } from '../permissions/permissions.service';
import { LocalUser } from '../rbac/entities/local-user.entity';

type AuthenticatedRequest = Request & { localUser?: LocalUser };

function reqMeta(req: Request) {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: NativeAuthService,
    private readonly mobileSessions: MobileSessionService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.login(dto.email, dto.senha, reqMeta(req));
    setAuthCookies(res, tokens);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.NO_CONTENT)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = (req as any).cookies?.[RT_COOKIE] as string | undefined;
    const tokens = await this.auth.refresh(raw ?? '', reqMeta(req));
    setAuthCookies(res, tokens);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = (req as any).cookies?.[RT_COOKIE] as string | undefined;
    if (raw) await this.auth.logout(raw);
    clearAuthCookies(res);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(@CurrentUser() user: RequestUser, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(user.sub, user.tenantId, dto.current_password, dto.new_password);
  }

  @Public()
  @Post('mobile-session')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async createMobileSession(
    @Body() dto: CreateMobileSessionDto,
  ): Promise<{ data: MobileSessionResponseDto }> {
    const data = await this.mobileSessions.createSessionFromCredentials(
      dto.email,
      dto.senha,
      dto.device_info,
    );
    return { data };
  }

  @Get('me')
  async me(@CurrentUser() user: RequestUser, @Req() req: AuthenticatedRequest) {
    if (!user) return {};
    const { sub, email, roles, tenantId } = user;
    const localUser = req.localUser;
    let permissions: string[] = [];

    if (roles?.includes('SUPERADMIN') || localUser?.role?.name === 'admin') {
      permissions = await this.permissionsService.listAllSlugs();
    } else if (localUser?.roleId) {
      permissions = await this.permissionsService.listEffectiveForRole(
        localUser.tenantId,
        localUser.roleId,
      );
    }

    return { sub, email, roles, tenantId, permissions };
  }

  // Preservar endpoint existente de revogar sessão mobile (regressão se removido).
  @Delete('mobile-session/:uuid')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @Param('uuid') sessionUuid: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.mobileSessions.revokeSession(sessionUuid, user.tenantId);
  }
}
