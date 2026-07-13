import {
  CanActivate, ExecutionContext, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AccessTokenService } from '../../auth/access-token.service';
import { MobileSessionService } from '../../auth/mobile-session.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RequestUser } from '../types/jwt-payload.type';

const AT_COOKIE = 'renowa_at';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokens: AccessTokenService,
    private readonly mobileSessionService: MobileSessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const cookieToken = (req as any).cookies?.[AT_COOKIE] as string | undefined;

    // Web: access token nativo HS256 no cookie renowa_at
    if (cookieToken) {
      try {
        req.user = await this.accessTokens.verify(cookieToken);
        return true;
      } catch {
        throw new UnauthorizedException('Token inválido ou expirado');
      }
    }

    // Mobile: HS256 de 30 dias no header Authorization
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      try {
        req.user = await this.mobileSessionService.validateSessionToken(authHeader.slice(7));
        return true;
      } catch {
        throw new UnauthorizedException('Token inválido ou expirado');
      }
    }

    throw new UnauthorizedException('Token não fornecido');
  }
}
