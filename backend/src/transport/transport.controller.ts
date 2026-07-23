import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { TransportService } from './transport.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { CreateTransportDto } from './dto/create-transport.dto';
import { UpdateTransportDto } from './dto/update-transport.dto';

/** Criar/Editar: ADMIN, VENDEDOR, GESTAO | Excluir: ADMIN, GESTAO */
@Controller('transportadoras')
export class TransportController {
  constructor(private readonly transportService: TransportService) {}

  @Post()
  @RequirePermission('transportadoras.criar')
  async create(@Body() dto: CreateTransportDto, @CurrentUser() user: RequestUser) {
    return this.transportService.create(dto, user.tenantId);
  }

  @Get()
  @RequirePermission('transportadoras.ver')
  async findAll(
    @Query() pagination: PaginationDto,
    @Query('search') search: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.transportService.findAll(user.tenantId, pagination, search);
  }

  @Get(':uuid')
  @RequirePermission('transportadoras.ver')
  async findOne(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser) {
    return this.transportService.findOne(uuid, user.tenantId);
  }

  @Patch(':uuid')
  @RequirePermission('transportadoras.editar')
  async update(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateTransportDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.transportService.update(uuid, dto, user.tenantId);
  }

  @Delete(':uuid')
  @RequirePermission('transportadoras.deletar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser): Promise<void> {
    await this.transportService.remove(uuid, user.tenantId);
  }
}
