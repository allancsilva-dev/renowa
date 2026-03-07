import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { JwksStrategy } from '../../auth/jwks.strategy';
import { MobileSessionService } from '../../auth/mobile-session.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RequestUser } from '../types/jwt-payload.type';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwksStrategy: JwksStrategy,
    private readonly mobileSessionService: MobileSessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const token = this.extractToken(req);

    if (!token) throw new UnauthorizedException('Token não fornecido');

    // Tenta validar como token RS256 do ZonaDevAuth (web)
    try {
      const payload = await this.jwksStrategy.verify(token);
      req.user = {
        sub: payload.sub,
        tenantId: payload.tenantId,
        tenantSubdomain: payload.tenantSubdomain,
        roles: payload.roles,
        plan: payload.plan,
        tokenVersion: payload.tokenVersion,
        jti: payload.jti,
      };
      return true;
    } catch {
      // Não é RS256 — tenta como sessão mobile HS256
    }

    // Valida como token de sessão mobile HS256 (Renowa)
    try {
      const user = await this.mobileSessionService.validateSessionToken(token);
      req.user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }
  }

  private extractToken(req: Request): string | null {
    // 1. Authorization: Bearer <token>
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    // 2. Cookie HTTP-only (web)
    const cookieToken = (req.cookies as Record<string, string>)?.['access_token'];
    if (cookieToken) return cookieToken;

    return null;
  }
}
