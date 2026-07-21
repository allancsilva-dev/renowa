import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderDto } from './dto/create-order.dto';
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

  @Get()
  @RequirePermission('pedidos.ver')
  async findAll(
    @Query() pagination: PaginationDto,
    @Query('status') status: string,
    @Query('search') search: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ordersService.findAll(user.tenantId, pagination, user, status, search);
  }

  @Get(':uuid')
  @RequirePermission('pedidos.ver')
  async findOne(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser) {
    return this.ordersService.findOne(uuid, user);
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
