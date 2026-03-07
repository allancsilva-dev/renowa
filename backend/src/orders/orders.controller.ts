import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus } from './entities/order.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequestUser } from '../common/types/jwt-payload.type';
import { IsEnum, IsOptional } from 'class-validator';

class UpdateStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;
}

@Controller('pedidos')
@UseGuards(RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles('ADMIN', 'VENDAS')
  async create(@Body() dto: CreateOrderDto, @CurrentUser() user: RequestUser) {
    const data = await this.ordersService.create(dto, user.tenantId);
    return { data };
  }

  @Get()
  async findAll(
    @Query() pagination: PaginationDto,
    @Query('status') status: OrderStatus,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ordersService.findAll(user.tenantId, pagination, status);
  }

  @Get(':uuid')
  async findOne(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser) {
    const data = await this.ordersService.findOne(uuid, user.tenantId);
    return { data };
  }

  @Patch(':uuid/status')
  @Roles('ADMIN', 'VENDAS')
  async updateStatus(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.ordersService.updateStatus(uuid, dto.status, user.tenantId);
    return { data };
  }

  @Delete(':uuid')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser): Promise<void> {
    await this.ordersService.remove(uuid, user.tenantId);
  }
}
