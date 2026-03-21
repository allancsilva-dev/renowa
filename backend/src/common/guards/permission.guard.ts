import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { REQUIRED_PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { LocalUser } from '../../rbac/entities/local-user.entity';
import { TenantRolePermission } from '../../rbac/entities/tenant-role-permission.entity';
import { RequestUser } from '../types/jwt-payload.type';

type RequestWithLocalUser = {
  user?: RequestUser;
  localUser?: LocalUser;
};

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(TenantRolePermission)
    private readonly rolePermissionRepo: Repository<TenantRolePermission>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string>(
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

    if (localUser.role?.name === 'admin') {
      return true;
    }

    if (!localUser.roleId) {
      return false;
    }

    const rolePermission = await this.rolePermissionRepo.findOne({
      where: {
        roleId: localUser.roleId,
        permission: { slug: required },
      },
      relations: ['permission'],
    });

    return !!rolePermission;
  }
}
