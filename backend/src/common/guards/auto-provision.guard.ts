import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RequestUser } from '../types/jwt-payload.type';
import { UsersService } from '../../users/users.service';
import { User } from '../../users/entities/user.entity';

type RequestWithAuth = Request & {
  user?: RequestUser;
  localUser?: User;
};

@Injectable()
export class AutoProvisionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<RequestWithAuth>();
    const user = req.user;

    if (!user?.sub || !user.tenantId) {
      return true;
    }

    let localUser = await this.usersService.findOptionalByUuidAndTenant(
      user.sub,
      user.tenantId,
    );

    if (!localUser) {
      const mode = (process.env.PROVISION_MODE ?? 'auto').toLowerCase();
      if (mode === 'approval') {
        throw new ForbiddenException(
          'Acesso pendente de aprovação pelo administrador',
        );
      }

      localUser = await this.usersService.upsertFromJwt({
        uuid: user.sub,
        tenantId: user.tenantId,
        email: user.email ?? `${user.sub}@placeholder.local`,
        nome: user.email?.split('@')[0] ?? user.sub,
        roles: [this.resolveProvisionRole(user.defaultRole)],
      });
    } else {
      localUser = await this.usersService.upsertFromJwt({
        uuid: user.sub,
        tenantId: user.tenantId,
        email: user.email ?? localUser.email,
        nome: localUser.nome,
        roles: localUser.roles,
      });
    }

    req.localUser = localUser;
    return true;
  }

  private resolveProvisionRole(defaultRole?: string): string {
    if (!defaultRole) return 'VENDEDOR';

    const value = defaultRole.toLowerCase().trim();
    if (value === 'admin') return 'ADMIN';
    if (value === 'gestor') return 'GESTAO';
    if (value === 'financeiro') return 'FINANCEIRO';
    if (value === 'vendedor') return 'VENDEDOR';
    if (value === 'viewer') return 'VENDEDOR';

    return 'VENDEDOR';
  }
}
