import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RequestUser } from '../types/jwt-payload.type';
import { UsersService } from '../../users/users.service';
import { LocalUser } from '../../rbac/entities/local-user.entity';

type RequestWithAuth = Request & {
  user?: RequestUser;
  localUser?: LocalUser;
};

/**
 * Resolve o `local_user` do JWT e anexa em `req.localUser` para o
 * `PermissionGuard` usar. NÃO cria usuário.
 *
 * PROB-0057: este guard se chamava `AutoProvisionGuard` e criava um
 * `local_users` na hora, com papel `'viewer'` e e-mail forjado
 * (`${sub}@placeholder.local`), quando não achava um. Isso é resquício da
 * arquitetura anterior, em que a identidade vinha de um IdP externo
 * (OIDC/ZonaDevAuth/JWKS) e o backend via usuários que nunca tinha visto.
 *
 * Com auth nativa esse ramo é inalcançável em operação normal: um JWT só
 * existe para quem tem linha em `usuarios`, e o único caminho que cria essa
 * linha (`UsersService.createTenantUser`, usado por `POST /users` e pelo
 * bootstrap) já grava o `local_users` na MESMA transação. O que sobrava do
 * ramo era efeito colateral ruim: 403 opaco quando a role `'viewer'` não
 * existia no tenant, e uma via implícita de criação de usuário num sistema
 * que não tem cadastro público.
 *
 * Agora é fail-closed: sem `local_user`, 403 com a causa real.
 */
@Injectable()
export class LocalUserContextGuard implements CanActivate {
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
    const jwt = req.user;
    const isSuperAdmin = !!jwt?.roles?.includes('SUPERADMIN');

    if (!jwt?.sub) {
      return true;
    }

    if (!jwt.tenantId && !isSuperAdmin) {
      throw new UnauthorizedException('tenantId ausente no JWT');
    }

    if (isSuperAdmin && !jwt.tenantId) {
      return true;
    }

    const tenantId = jwt.tenantId as string;

    const anyLocalUser = await this.usersService.findAnyLocalUserByAuthUserId(jwt.sub);
    if (anyLocalUser && anyLocalUser.tenantId !== tenantId) {
      console.error({
        event: 'TENANT_MISMATCH',
        userId: jwt.sub,
        jwtTenant: tenantId,
        localTenant: anyLocalUser.tenantId,
      });
      throw new ForbiddenException('Tenant mismatch para local_user');
    }

    const localUser = await this.usersService.findLocalUserByAuthUserIdAndTenant(
      jwt.sub,
      tenantId,
    );

    if (!localUser) {
      console.error({
        event: 'LOCAL_USER_AUSENTE',
        userId: jwt.sub,
        jwtTenant: tenantId,
      });
      throw new ForbiddenException(
        'Usuário sem acesso local neste tenant. Um administrador precisa criá-lo em Usuários.',
      );
    }

    await this.usersService.touchLocalUserLastLogin(localUser.id);

    req.localUser = localUser;
    return true;
  }
}
