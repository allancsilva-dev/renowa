import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { AlterarPercentualVendaDto, ListPrepostoVendasDto, PagamentoVendaDto } from './dto/preposto-vendas.dto';
import { OpcoesVendedoresDto } from './dto/opcoes-vendedores.dto';
import { PrepostoVendasService } from './preposto-vendas.service';

const uuidPipe = new ParseUUIDPipe({ version: '4' });

/** API neutra: comissões de usuários internos e prepostos escolhidos no pedido. */
@Controller('vendedores')
export class VendedoresController {
  constructor(private readonly vendasService: PrepostoVendasService) {}

  @Get('comissoes/opcoes')
  @RequirePermission('financeiro.ver')
  async opcoes(@Query() query: OpcoesVendedoresDto, @CurrentUser() user: RequestUser) {
    return this.vendasService.opcoes(user.tenantId, query);
  }

  @Get('comissoes')
  @RequirePermission('financeiro.ver')
  async list(@Query() query: ListPrepostoVendasDto, @CurrentUser() user: RequestUser) {
    return this.vendasService.list(user.tenantId, query);
  }

  @Patch('comissoes/:uuid/percentual')
  @RequirePermission('financeiro.editar')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async percentual(
    @Param('uuid', uuidPipe) uuid: string,
    @Body() dto: AlterarPercentualVendaDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.vendasService.alterarPercentual(uuid, dto, user.tenantId);
  }

  @Patch('comissoes/:uuid/pagamento')
  @RequirePermission('financeiro.editar')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async pagamento(
    @Param('uuid', uuidPipe) uuid: string,
    @Body() dto: PagamentoVendaDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.vendasService.registrarPagamento(uuid, dto, user.tenantId);
  }
}
