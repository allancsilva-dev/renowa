import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderDto } from './dto/create-order.dto';
import { CreateExternalOrderDto, UpdateExternalOrderDto } from './dto/create-external-order.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { VersionDto } from '../common/dto/version.dto';

class UpdateStatusDto extends VersionDto {
  @IsString()
  status: string;
}

/**
 * Visualizar: ADMIN (todos), VENDEDOR (próprios), FINANCEIRO (todos), GESTAO (todos)
 * Criar/Editar: ADMIN, VENDEDOR, GESTAO | Excluir: ADMIN, GESTAO
 */
@Controller('pedidos')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @RequirePermission('pedidos.criar')
  async create(@Body() dto: CreateOrderDto, @CurrentUser() user: RequestUser) {
    return this.ordersService.create(dto, user);
  }

  /**
   * Pedido externo (digitado em sistema de terceiro). Rota separada porque a
   * forma do corpo é outra — sem itens, com número de origem, sistema e valor.
   * Todo o resto do ciclo (liberar, faturar, cancelar, excluir) usa as mesmas
   * rotas do pedido interno.
   */
  @Post('externos')
  @RequirePermission('pedidos.criar')
  async createExternal(@Body() dto: CreateExternalOrderDto, @CurrentUser() user: RequestUser) {
    return this.ordersService.createExternal(dto, user);
  }

  @Put('externos/:uuid')
  @RequirePermission('pedidos.editar')
  async updateExternal(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateExternalOrderDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ordersService.updateExternal(uuid, dto, user);
  }

  @Get()
  @RequirePermission('pedidos.ver')
  async findAll(
    @Query() pagination: PaginationDto,
    @Query('status') status: string,
    @Query('search') search: string,
    @Query('origem') origem: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ordersService.findAll(user.tenantId, pagination, user, status, search, origem);
  }

  @Get(':uuid')
  @RequirePermission('pedidos.ver')
  async findOne(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser) {
    return this.ordersService.findOneDetalhe(uuid, user);
  }

  @Put(':uuid')
  @RequirePermission('pedidos.editar')
  async update(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ordersService.update(uuid, dto, user);
  }

  @Patch(':uuid/status')
  @RequirePermission('pedidos.editar')
  async updateStatus(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ordersService.updateStatus(uuid, dto.status, dto.version, user);
  }

  @Patch(':uuid/liberar')
  @RequirePermission('pedidos.liberar')
  async liberar(
    @Param('uuid') uuid: string,
    @Body() dto: VersionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ordersService.liberar(uuid, dto.version, user);
  }

  @Delete(':uuid')
  @RequirePermission('pedidos.deletar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('uuid') uuid: string,
    @Query() versionDto: VersionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.ordersService.remove(uuid, versionDto.version, user);
  }
}
