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

    let localUser = await this.usersService.findLocalUserByAuthUserIdAndTenant(
      jwt.sub,
      tenantId,
    );

    if (!localUser) {
      const viewerRole = await this.usersService.findTenantRoleByName(tenantId, 'viewer');
      if (!viewerRole) {
        console.error({
          event: 'TENANT_NOT_PROVISIONED',
          userId: jwt.sub,
          jwtTenant: tenantId,
        });
        throw new ForbiddenException('Tenant não provisionado com role viewer');
      }

      localUser = await this.usersService.createLocalUser({
        tenantId,
        authUserId: jwt.sub,
        email: jwt.email ?? `${jwt.sub}@placeholder.local`,
        roleId: viewerRole.id,
      });
    }

    await this.usersService.touchLocalUserLastLogin(localUser.id);

    req.localUser = localUser;
    return true;
  }
}
