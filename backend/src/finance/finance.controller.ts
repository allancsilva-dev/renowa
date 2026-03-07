import {
  Controller, Get, Post, Body, Param, Query, UseGuards, Delete, HttpCode, HttpStatus,
} from '@nestjs/common';
import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { FinanceService } from './finance.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequestUser } from '../common/types/jwt-payload.type';

class CreateMovementDto {
  @IsUUID('4') uuid: string;
  /** 'Custo Fixo' | 'Custo Rotativo' | 'Venda' */
  @IsNotEmpty() @IsString() tipo: string;
  @IsNumber() @Min(0) valor: number;
  @IsOptional() @IsString() data?: string;
  @IsOptional() @IsString() descricao?: string;
}

class CreateComissaoDto {
  @IsUUID('4') uuid: string;
  @IsOptional() @IsUUID('4') pedido_uuid?: string;
  @IsOptional() @IsString() nfe?: string;
  @IsOptional() @IsNumber() @Min(0) valor_faturado?: number;
  @IsOptional() @IsNumber() @Min(0) perc_comissao?: number;
  @IsNumber() @Min(0) valor_comissao: number;
  @IsOptional() @IsString() data_faturamento?: string;
}

class CreateInadimplenciaDto {
  @IsUUID('4') uuid: string;
  @IsOptional() @IsUUID('4') cliente_uuid?: string;
  @IsOptional() @IsString() empresa_devedora?: string;
  @IsOptional() @IsNumber() @Min(0) valor_aberto?: number;
  @IsOptional() @IsString() observacao?: string;
}

/**
 * Visualizar: ADMIN, FINANCEIRO, GESTAO
 * Lançar: ADMIN, FINANCEIRO, GESTAO
 */
@Controller('financeiro')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'FINANCEIRO', 'GESTAO')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('dashboard')
  async dashboard(@CurrentUser() user: RequestUser) {
    return this.financeService.getDashboard(user.tenantId);
  }

  @Post('movimentacoes')
  async create(@Body() dto: CreateMovementDto, @CurrentUser() user: RequestUser) {
    return this.financeService.createMovimento(dto, user.tenantId);
  }

  @Get('movimentacoes')
  async findAll(
    @Query() pagination: PaginationDto,
    @Query('tipo') tipo: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.financeService.findAllMovimentos(user.tenantId, pagination, tipo);
  }

  @Get('movimentacoes/:uuid')
  async findOne(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser) {
    return this.financeService.findOneMovimento(uuid, user.tenantId);
  }

  @Delete('movimentacoes/:uuid')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser): Promise<void> {
    await this.financeService.removeMovimento(uuid, user.tenantId);
  }

  @Post('comissoes')
  async createComissao(@Body() dto: CreateComissaoDto, @CurrentUser() user: RequestUser) {
    return this.financeService.createComissao(dto, user.tenantId);
  }

  @Get('comissoes')
  async findAllComissoes(@Query() pagination: PaginationDto, @CurrentUser() user: RequestUser) {
    return this.financeService.findAllComissoes(user.tenantId, pagination);
  }

  @Post('inadimplencia')
  async createInadimplencia(@Body() dto: CreateInadimplenciaDto, @CurrentUser() user: RequestUser) {
    return this.financeService.createInadimplencia(dto, user.tenantId);
  }

  @Get('inadimplencia')
  async findAllInadimplencia(@Query() pagination: PaginationDto, @CurrentUser() user: RequestUser) {
    return this.financeService.findAllInadimplencia(user.tenantId, pagination);
  }
}
