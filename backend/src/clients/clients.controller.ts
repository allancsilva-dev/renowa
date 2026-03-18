import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequestUser } from '../common/types/jwt-payload.type';

/**
 * Visualizar: todos | Criar/Editar: ADMIN, VENDEDOR, GESTAO | Excluir: ADMIN, GESTAO
 */
@Controller('clientes')
@UseGuards(RolesGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @Roles('ADMIN', 'VENDEDOR', 'GESTAO')
  @RequirePermission('clientes.criar')
  async create(@Body() dto: CreateClientDto, @CurrentUser() user: RequestUser) {
    return this.clientsService.create(dto, user.tenantId);
  }

  @Get()
  @RequirePermission('clientes.ver')
  async findAll(
    @Query() pagination: PaginationDto,
    @Query('search') search: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.clientsService.findAll(user.tenantId, pagination, search);
  }

  @Get(':uuid')
  @RequirePermission('clientes.ver')
  async findOne(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser) {
    return this.clientsService.findOne(uuid, user.tenantId);
  }

  @Patch(':uuid')
  @Roles('ADMIN', 'VENDEDOR', 'GESTAO')
  @RequirePermission('clientes.editar')
  async update(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.clientsService.update(uuid, dto, user.tenantId);
  }

  @Delete(':uuid')
  @Roles('ADMIN', 'GESTAO')
  @RequirePermission('clientes.deletar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser): Promise<void> {
    await this.clientsService.remove(uuid, user.tenantId);
  }
}
