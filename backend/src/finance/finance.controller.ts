import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { FinanceService, CreateMovementDto } from './finance.service';
import { MovimentacaoTipo, MovimentacaoStatus } from './entities/finance-movement.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequestUser } from '../common/types/jwt-payload.type';
import { IsDateString } from 'class-validator';

class PagarDto {
  @IsDateString()
  data_pagamento: string;
}

@Controller('financeiro')
@UseGuards(RolesGuard)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('dashboard')
  async dashboard(@CurrentUser() user: RequestUser) {
    const data = await this.financeService.getDashboard(user.tenantId);
    return { data };
  }

  @Post('movimentacoes')
  @Roles('ADMIN', 'FINANCEIRO')
  async create(@Body() dto: CreateMovementDto, @CurrentUser() user: RequestUser) {
    const data = await this.financeService.create(dto, user.tenantId);
    return { data };
  }

  @Get('movimentacoes')
  async findAll(
    @Query() pagination: PaginationDto,
    @Query('tipo') tipo: MovimentacaoTipo,
    @Query('status') status: MovimentacaoStatus,
    @CurrentUser() user: RequestUser,
  ) {
    return this.financeService.findAll(user.tenantId, pagination, { tipo, status });
  }

  @Get('movimentacoes/:uuid')
  async findOne(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser) {
    const data = await this.financeService.findOne(uuid, user.tenantId);
    return { data };
  }

  @Patch('movimentacoes/:uuid/pagar')
  @Roles('ADMIN', 'FINANCEIRO')
  async pagar(
    @Param('uuid') uuid: string,
    @Body() dto: PagarDto,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.financeService.pagar(uuid, dto.data_pagamento, user.tenantId);
    return { data };
  }
}
