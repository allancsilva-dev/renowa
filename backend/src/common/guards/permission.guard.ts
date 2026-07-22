import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { LocalUser } from '../../rbac/entities/local-user.entity';
import { RequestUser } from '../types/jwt-payload.type';
import { PermissionsService } from '../../permissions/permissions.service';

type RequestWithLocalUser = {
  user?: RequestUser;
  localUser?: LocalUser;
};

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string | string[]>(
      REQUIRED_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) return true;

    const req = context.switchToHttp().getRequest<RequestWithLocalUser>();

    if (req.user?.roles?.includes('SUPERADMIN')) {
      return true;
    }

    const localUser = req.localUser;
    if (!localUser) {
      throw new ForbiddenException('Local user context not found');
    }

    if (!localUser.roleId) {
      return false;
    }

    const slugs = new Set(await this.permissionsService.listEffectiveForRole(
      localUser.tenantId,
      localUser.roleId,
    ));
    const requiredPermissions = Array.isArray(required) ? required : [required];
    return requiredPermissions.every((permission) => slugs.has(permission));
  }
}
