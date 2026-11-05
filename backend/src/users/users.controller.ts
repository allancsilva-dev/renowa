import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { MarkReleaseNotesSeenDto } from './dto/mark-release-notes-seen.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermission('usuarios.gerenciar')
  async list(@CurrentUser() user: RequestUser) {
    return this.usersService.listTenantUsers(user.tenantId, user);
  }

  @Post()
  @RequirePermission('usuarios.gerenciar')
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.createTenantUser(user.tenantId, dto, user);
  }

  /** Modal de Novidades: qualquer usuário logado, sem permissão extra. */
  @Get('me/release-notes')
  async releaseNotesState(@CurrentUser() user: RequestUser) {
    return this.usersService.getReleaseNotesState({ authUserId: user.sub, tenantId: user.tenantId });
  }

  @Patch('me/release-notes')
  @HttpCode(204)
  async markReleaseNotesSeen(
    @CurrentUser() user: RequestUser,
    @Body() dto: MarkReleaseNotesSeenDto,
  ): Promise<void> {
    await this.usersService.markReleaseNotesSeen({
      authUserId: user.sub,
      tenantId: user.tenantId,
      version: dto.version,
    });
  }

  @Patch(':id')
  @RequirePermission('usuarios.gerenciar')
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateTenantUser(user.tenantId, id, dto, user);
  }

  @Get('me')
  async me(
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ): Promise<void> {
    const payload = await this.usersService.getCurrentUserContext({
      authUserId: user.sub,
      tenantId: user.tenantId,
    });

    // Retorna formato bruto esperado pelo frontend sem envelope { data: ... }.
    res.status(200).json(payload);
  }
}
