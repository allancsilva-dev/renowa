import {
  Controller, Get, Post, Body, Param, Query, UseGuards, Delete, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FinanceService } from './finance.service';
import { CreateMovementDto } from './dto/create-movement.dto';
import { CreateComissaoDto } from './dto/create-comissao.dto';
import { CreateInadimplenciaDto } from './dto/create-inadimplencia.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequestUser } from '../common/types/jwt-payload.type';

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
