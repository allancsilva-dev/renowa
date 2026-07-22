import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FaturamentoService } from './faturamento.service';
import { CreateNotaFiscalDto } from './dto/create-nota-fiscal.dto';
import { UpdateNotaFiscalDto } from './dto/update-nota-fiscal.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { VersionDto } from '../common/dto/version.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';

@Controller('faturamento')
export class FaturamentoController {
  constructor(private readonly faturamentoService: FaturamentoService) {}

  @Get('pedidos')
  @RequirePermission('faturamento.ver')
  async findPedidos(@Query() pagination: PaginationDto, @CurrentUser() user: RequestUser) {
    return this.faturamentoService.findPedidos(user.tenantId, pagination);
  }

  @Get('pedidos/:uuid')
  @RequirePermission('faturamento.ver')
  async findPedidoDetalhe(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser) {
    return this.faturamentoService.findPedidoDetalhe(uuid, user.tenantId);
  }

  @Post('pedidos/:uuid/notas')
  @RequirePermission('faturamento.editar')
  async registrarNota(
    @Param('uuid') uuid: string,
    @Body() dto: CreateNotaFiscalDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.faturamentoService.registrarNota(uuid, dto, user.tenantId);
  }

  @Patch('notas/:uuid')
  @RequirePermission('faturamento.editar')
  async atualizarNota(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateNotaFiscalDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.faturamentoService.atualizarNota(uuid, dto, user.tenantId);
  }

  @Delete('notas/:uuid')
  @RequirePermission('faturamento.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async excluirNota(
    @Param('uuid') uuid: string,
    @Query() versionDto: VersionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.faturamentoService.excluirNota(uuid, versionDto.version, user.tenantId);
  }
}
