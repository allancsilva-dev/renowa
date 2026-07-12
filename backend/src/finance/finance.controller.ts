import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, Delete, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FinanceService } from './finance.service';
import { CreateMovementDto } from './dto/create-movement.dto';
import { UpdateMovementDto } from './dto/update-movement.dto';
import { CreateComissaoDto, UpdateComissaoDto } from './dto/create-comissao.dto';
import { CreateInadimplenciaDto, UpdateInadimplenciaDto } from './dto/create-inadimplencia.dto';
import { CreateParceiroDto, UpdateParceiroDto } from './dto/create-parceiro.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequestUser } from '../common/types/jwt-payload.type';
import { VersionDto } from '../common/dto/version.dto';

@Controller('financeiro')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'FINANCEIRO', 'GESTAO')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  // ── Dashboard ─────────────────────────────────────────────

  @Get('dashboard')
  @RequirePermission('financeiro.ver')
  async dashboard(@CurrentUser() user: RequestUser) {
    return this.financeService.getDashboard(user.tenantId);
  }

  // ── Fluxo de Caixa ────────────────────────────────────────

  @Get('fluxo-caixa')
  @RequirePermission('financeiro.ver')
  async fluxoCaixa(
    @Query('mes') mes: string,
    @Query('ano') ano: string,
    @CurrentUser() user: RequestUser,
  ) {
    const now = new Date();
    return this.financeService.getFluxoCaixa(
      user.tenantId,
      mes ? Number(mes) : now.getMonth() + 1,
      ano ? Number(ano) : now.getFullYear(),
    );
  }

  // ── Movimentações / Lançamentos ───────────────────────────

  @Post('lancamentos')
  @RequirePermission('financeiro.editar')
  async create(@Body() dto: CreateMovementDto, @CurrentUser() user: RequestUser) {
    return this.financeService.createMovimento(dto, user.tenantId);
  }

  @Get('lancamentos')
  @RequirePermission('financeiro.ver')
  async findAll(
    @Query() pagination: PaginationDto,
    @Query('tipo') tipo: string,
    @Query('mes') mes: string,
    @Query('ano') ano: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.financeService.findAllMovimentos(
      user.tenantId,
      pagination,
      tipo || undefined,
      mes ? Number(mes) : undefined,
      ano ? Number(ano) : undefined,
    );
  }

  @Get('lancamentos/:uuid')
  @RequirePermission('financeiro.ver')
  async findOne(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser) {
    return this.financeService.findOneMovimento(uuid, user.tenantId);
  }

  @Patch('lancamentos/:uuid')
  @RequirePermission('financeiro.editar')
  async update(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateMovementDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.financeService.updateMovimento(uuid, dto, user.tenantId);
  }

  @Delete('lancamentos/:uuid')
  @RequirePermission('financeiro.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('uuid') uuid: string, @Query() dto: VersionDto, @CurrentUser() user: RequestUser): Promise<void> {
    await this.financeService.removeMovimento(uuid, dto.version, user.tenantId);
  }

  // Rotas legadas (alias para movimentacoes)
  @Post('movimentacoes')
  @RequirePermission('financeiro.editar')
  async createMovimentacao(@Body() dto: CreateMovementDto, @CurrentUser() user: RequestUser) {
    return this.financeService.createMovimento(dto, user.tenantId);
  }

  @Get('movimentacoes')
  @RequirePermission('financeiro.ver')
  async findAllMovimentacoes(
    @Query() pagination: PaginationDto,
    @Query('tipo') tipo: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.financeService.findAllMovimentos(user.tenantId, pagination, tipo || undefined);
  }

  @Get('movimentacoes/:uuid')
  @RequirePermission('financeiro.ver')
  async findOneMovimentacao(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser) {
    return this.financeService.findOneMovimento(uuid, user.tenantId);
  }

  @Delete('movimentacoes/:uuid')
  @RequirePermission('financeiro.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMovimentacao(@Param('uuid') uuid: string, @Query() dto: VersionDto, @CurrentUser() user: RequestUser): Promise<void> {
    await this.financeService.removeMovimento(uuid, dto.version, user.tenantId);
  }

  // ── Comissões ─────────────────────────────────────────────

  @Post('comissoes')
  @RequirePermission('financeiro.editar')
  async createComissao(@Body() dto: CreateComissaoDto, @CurrentUser() user: RequestUser) {
    return this.financeService.createComissao(dto, user.tenantId);
  }

  @Get('comissoes/resumo')
  @RequirePermission('financeiro.ver')
  async resumoComissoes(
    @Query('mes') mes: string,
    @Query('ano') ano: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.financeService.getResumoComissoes(
      user.tenantId,
      mes ? Number(mes) : undefined,
      ano ? Number(ano) : undefined,
    );
  }

  @Get('comissoes/por-empresa')
  @RequirePermission('financeiro.ver')
  async vendasPorEmpresa(
    @Query('fornecedor_id') fornecedor_id: string,
    @Query('mes') mes: string,
    @Query('ano') ano: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.financeService.getVendasPorEmpresa(
      user.tenantId,
      mes ? Number(mes) : undefined,
      ano ? Number(ano) : undefined,
      fornecedor_id ? Number(fornecedor_id) : undefined,
    );
  }

  @Get('comissoes')
  @RequirePermission('financeiro.ver')
  async findAllComissoes(
    @Query() pagination: PaginationDto,
    @Query('fornecedor_id') fornecedor_id: string,
    @Query('mes') mes: string,
    @Query('ano') ano: string,
    @Query('status') status: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.financeService.findAllComissoes(user.tenantId, pagination, {
      fornecedor_id: fornecedor_id ? Number(fornecedor_id) : undefined,
      mes: mes ? Number(mes) : undefined,
      ano: ano ? Number(ano) : undefined,
      status: status || undefined,
    });
  }

  @Patch('comissoes/:uuid')
  @RequirePermission('financeiro.editar')
  async updateComissao(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateComissaoDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.financeService.updateComissao(uuid, dto, user.tenantId);
  }

  @Delete('comissoes/:uuid')
  @RequirePermission('financeiro.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeComissao(@Param('uuid') uuid: string, @Query() dto: VersionDto, @CurrentUser() user: RequestUser): Promise<void> {
    await this.financeService.removeComissao(uuid, dto.version, user.tenantId);
  }

  // ── Parceiros Comerciais ───────────────────────────────────

  @Post('parceiros')
  @RequirePermission('financeiro.editar')
  async createParceiro(@Body() dto: CreateParceiroDto, @CurrentUser() user: RequestUser) {
    return this.financeService.createParceiro(dto, user.tenantId);
  }

  @Get('parceiros')
  @RequirePermission('financeiro.ver')
  async findAllParceiros(
    @Query() pagination: PaginationDto,
    @Query('nome_parceiro') nome_parceiro: string,
    @Query('mes') mes: string,
    @Query('ano') ano: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.financeService.findAllParceiros(user.tenantId, pagination, {
      nome_parceiro: nome_parceiro || undefined,
      mes: mes ? Number(mes) : undefined,
      ano: ano ? Number(ano) : undefined,
    });
  }

  @Patch('parceiros/:uuid')
  @RequirePermission('financeiro.editar')
  async updateParceiro(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateParceiroDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.financeService.updateParceiro(uuid, dto, user.tenantId);
  }

  @Delete('parceiros/:uuid')
  @RequirePermission('financeiro.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeParceiro(@Param('uuid') uuid: string, @Query() dto: VersionDto, @CurrentUser() user: RequestUser): Promise<void> {
    await this.financeService.removeParceiro(uuid, dto.version, user.tenantId);
  }

  // ── Inadimplência ─────────────────────────────────────────

  @Post('inadimplencia')
  @RequirePermission('financeiro.editar')
  async createInadimplencia(@Body() dto: CreateInadimplenciaDto, @CurrentUser() user: RequestUser) {
    return this.financeService.createInadimplencia(dto, user.tenantId);
  }

  @Get('inadimplencia')
  @RequirePermission('financeiro.ver')
  async findAllInadimplencia(@Query() pagination: PaginationDto, @CurrentUser() user: RequestUser) {
    return this.financeService.findAllInadimplencia(user.tenantId, pagination);
  }

  @Patch('inadimplencia/:uuid')
  @RequirePermission('financeiro.editar')
  async updateInadimplencia(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateInadimplenciaDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.financeService.updateInadimplencia(uuid, dto, user.tenantId);
  }

  @Delete('inadimplencia/:uuid')
  @RequirePermission('financeiro.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeInadimplencia(@Param('uuid') uuid: string, @Query() dto: VersionDto, @CurrentUser() user: RequestUser): Promise<void> {
    await this.financeService.removeInadimplencia(uuid, dto.version, user.tenantId);
  }
}
