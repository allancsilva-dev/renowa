import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PermissionMode,
  REQUIRED_PERMISSION_KEY,
  REQUIRED_PERMISSION_MODE_KEY,
} from '../decorators/require-permission.decorator';
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

    // Ausência de metadata de modo é AND, o padrão histórico: nenhuma rota já
    // escrita muda de comportamento por causa do modo novo.
    const mode = this.reflector.getAllAndOverride<PermissionMode>(
      REQUIRED_PERMISSION_MODE_KEY,
      [context.getHandler(), context.getClass()],
    ) ?? 'all';

    return mode === 'any'
      ? requiredPermissions.some((permission) => slugs.has(permission))
      : requiredPermissions.every((permission) => slugs.has(permission));
  }
}
