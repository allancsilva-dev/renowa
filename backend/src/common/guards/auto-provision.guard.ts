import {
  CanActivate,
  ExecutionContext,
  Injectable,
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
    const user = req.user;

    if (!user?.sub || !user.tenantId) {
      return true;
    }

    const localUser = await this.usersService.findOrProvisionLocalUserFromJwt(user);

    req.localUser = localUser;
    return true;
  }
}
