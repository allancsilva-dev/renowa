import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PrepostosService } from './prepostos.service';
import { PrepostoVendasService } from './preposto-vendas.service';
import { AlterarPercentualVendaDto, ListPrepostoVendasDto, PagamentoVendaDto } from './dto/preposto-vendas.dto';
import { CreatePrepostoDto } from './dto/create-preposto.dto';
import { UpdatePrepostoDto } from './dto/update-preposto.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { VersionDto } from '../common/dto/version.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';

const uuidPipe = new ParseUUIDPipe({ version: '4' });

/** Cadastro de prepostos. Vendedor não tem acesso (documento e contato de terceiro). */
@Controller('prepostos')
export class PrepostosController {
  constructor(
    private readonly prepostosService: PrepostosService,
    private readonly vendasService: PrepostoVendasService,
  ) {}

  // Rotas de "vendas" antes de ':uuid' — senão GET /prepostos/vendas casaria como uuid.
  @Get('vendas')
  @RequirePermission('prepostos.ver')
  async listVendas(@Query() query: ListPrepostoVendasDto, @CurrentUser() user: RequestUser) {
    return this.vendasService.list(user.tenantId, query);
  }

  @Patch('vendas/:uuid/percentual')
  @RequirePermission('prepostos.editar')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async alterarPercentual(
    @Param('uuid', uuidPipe) uuid: string,
    @Body() dto: AlterarPercentualVendaDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.vendasService.alterarPercentual(uuid, dto, user.tenantId);
  }

  /** Mexe no caixa: exige financeiro.editar além de enxergar prepostos. */
  @Patch('vendas/:uuid/pagamento')
  @RequirePermission(['prepostos.ver', 'financeiro.editar'])
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async registrarPagamento(
    @Param('uuid', uuidPipe) uuid: string,
    @Body() dto: PagamentoVendaDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.vendasService.registrarPagamento(uuid, dto, user.tenantId);
  }

  @Post()
  @RequirePermission('prepostos.criar')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async create(@Body() dto: CreatePrepostoDto, @CurrentUser() user: RequestUser) {
    return this.prepostosService.create(dto, user.tenantId);
  }

  @Get()
  @RequirePermission('prepostos.ver')
  async findAll(@Query() pagination: PaginationDto, @CurrentUser() user: RequestUser) {
    return this.prepostosService.findAll(user.tenantId, pagination);
  }

  @Get(':uuid')
  @RequirePermission('prepostos.ver')
  async findOne(@Param('uuid', uuidPipe) uuid: string, @CurrentUser() user: RequestUser) {
    return this.prepostosService.findOne(uuid, user.tenantId);
  }

  @Patch(':uuid')
  @RequirePermission('prepostos.editar')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async update(
    @Param('uuid', uuidPipe) uuid: string,
    @Body() dto: UpdatePrepostoDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.prepostosService.update(uuid, dto, user.tenantId);
  }

  @Delete(':uuid')
  @RequirePermission('prepostos.deletar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('uuid', uuidPipe) uuid: string,
    @Query() versionDto: VersionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.prepostosService.remove(uuid, versionDto.version, user.tenantId);
  }
}
