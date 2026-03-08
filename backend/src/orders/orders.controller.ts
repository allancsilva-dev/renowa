import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequestUser } from '../common/types/jwt-payload.type';

class UpdateStatusDto {
  @IsString()
  status: string;
}

/**
 * Visualizar: ADMIN (todos), VENDEDOR (próprios), FINANCEIRO (todos), GESTAO (todos)
 * Criar/Editar: ADMIN, VENDEDOR, GESTAO | Excluir: ADMIN, GESTAO
 */
@Controller('pedidos')
@UseGuards(RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles('ADMIN', 'VENDEDOR', 'GESTAO')
  async create(@Body() dto: CreateOrderDto, @CurrentUser() user: RequestUser) {
    return this.ordersService.create(dto, user);
  }

  @Get()
  async findAll(
    @Query() pagination: PaginationDto,
    @Query('status') status: string,
    @Query('search') search: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ordersService.findAll(user.tenantId, pagination, user, status, search);
  }

  @Get(':uuid')
  async findOne(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser) {
    return this.ordersService.findOne(uuid, user.tenantId);
  }

  @Patch(':uuid/status')
  @Roles('ADMIN', 'VENDEDOR', 'GESTAO')
  async updateStatus(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ordersService.updateStatus(uuid, dto.status, user.tenantId);
  }

  @Delete(':uuid')
  @Roles('ADMIN', 'GESTAO')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser): Promise<void> {
    await this.ordersService.remove(uuid, user.tenantId);
  }
}
