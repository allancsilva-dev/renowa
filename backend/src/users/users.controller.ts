import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async me(
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ): Promise<void> {
    const payload = await this.usersService.getCurrentUserContext({
      authUserId: user.sub,
      tenantId: user.tenantId,
      email: user.email ?? `${user.sub}@placeholder.local`,
      defaultRole: user.defaultRole,
    });

    // Retorna formato bruto esperado pelo frontend sem envelope { data: ... }.
    res.status(200).json(payload);
  }
}
