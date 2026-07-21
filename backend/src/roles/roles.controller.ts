import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermission('usuarios.gerenciar')
  async list(@CurrentUser() user: RequestUser) {
    return this.rolesService.listRoles(user.tenantId);
  }

  @Post()
  @RequirePermission('usuarios.gerenciar')
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateRoleDto,
  ) {
    return this.rolesService.createRole(user.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermission('usuarios.gerenciar')
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rolesService.updateRole(user.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermission('usuarios.gerenciar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.rolesService.deleteRole(user.tenantId, id);
  }

  @Patch(':id/permissions')
  @RequirePermission('usuarios.gerenciar')
  async updatePermissions(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    return this.rolesService.updateRolePermissions(user.tenantId, id, dto.permissions);
  }
}
