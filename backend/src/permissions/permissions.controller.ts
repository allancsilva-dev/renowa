import { Controller, Get } from '@nestjs/common';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PermissionsService } from './permissions.service';

@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @RequirePermission('usuarios.gerenciar')
  async list() {
    return this.permissionsService.listAll();
  }
}
