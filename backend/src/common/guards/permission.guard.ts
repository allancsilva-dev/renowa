import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { RolePermission } from '../entities/role-permission.entity';
import { REQUIRED_PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { User } from '../../users/entities/user.entity';

type RequestWithLocalUser = {
  localUser?: User;
};

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepo: Repository<RolePermission>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string>(
      REQUIRED_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) return true;

    const req = context.switchToHttp().getRequest<RequestWithLocalUser>();
    const localUser = req.localUser;
    if (!localUser?.roles?.length) return false;

    if (localUser.roles.includes('ADMIN')) return true;

    const rolePermissions = await this.rolePermissionRepo.find({
      where: {
        role: In(localUser.roles),
      },
      relations: ['permission'],
    });

    const slugs = new Set(rolePermissions.map((item) => item.permission.slug));
    return slugs.has(required);
  }
}
