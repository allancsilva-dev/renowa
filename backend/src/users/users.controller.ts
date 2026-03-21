import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async list(@CurrentUser() user: RequestUser) {
    return this.usersService.listTenantUsers(user.tenantId);
  }

  @Post()
  async create(
    @CurrentUser() user: RequestUser,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.createTenantUser(user.tenantId, authorization, dto);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateTenantUser(user.tenantId, id, dto);
  }

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
