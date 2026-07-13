import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { SyncService } from './sync.service';
import { SyncPushDto, SyncPushV2Dto, SyncPullDto, SyncPullV2Dto, SyncEntity } from './dto/sync.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { Client } from '../clients/entities/client.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Product } from '../products/entities/product.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Transport } from '../transport/entities/transport.entity';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { LocalUser } from '../rbac/entities/local-user.entity';
import { SyncAuthorizationService } from './sync-authorization.service';

type SyncRequest = Request & { localUser?: LocalUser };

/**
 * CHANGELOG #8: Endpoints separados por entidade (sync por entidade).
 * CHANGELOG #11: POST /api/sync com rate limit específico.
 */
@Controller('sync')
export class SyncController {
  constructor(
    private readonly syncService: SyncService,
    private readonly syncAuthorization: SyncAuthorizationService,
  ) {}

  /**
   * POST /api/sync
   * Mobile envia até 200 itens de múltiplas entidades.
   * CHANGELOG #4: Transaction por item.
   * CHANGELOG #11: Limite 200 items por request.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async push(
    @Body() dto: SyncPushDto,
    @CurrentUser() user: RequestUser,
    @Req() req: SyncRequest,
  ) {
    await this.syncAuthorization.assertCanPush(dto.items, user, req.localUser);
    return this.syncService.pushItems(dto.items, user.tenantId);
  }

  @Post('v2')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async pushV2(
    @Body() dto: SyncPushV2Dto,
    @CurrentUser() user: RequestUser,
    @Req() req: SyncRequest,
  ) {
    await this.syncAuthorization.assertCanPush(dto.items, user, req.localUser);
    return this.syncService.pushItemsV2(dto, user.tenantId);
  }

  private pullV2(entity: SyncEntity, dto: SyncPullV2Dto, user: RequestUser) {
    return this.syncService.pullEntityV2(entity, dto, user.tenantId);
  }

  @Get('v2/clientes') @RequirePermission('clientes.ver')
  pullClientesV2(@Query() dto: SyncPullV2Dto, @CurrentUser() user: RequestUser) {
    return this.pullV2(SyncEntity.CLIENTES, dto, user);
  }

  @Get('v2/produtos') @RequirePermission('produtos.ver')
  pullProdutosV2(@Query() dto: SyncPullV2Dto, @CurrentUser() user: RequestUser) {
    return this.pullV2(SyncEntity.PRODUTOS, dto, user);
  }

  @Get('v2/fornecedores') @RequirePermission('fornecedores.ver')
  pullFornecedoresV2(@Query() dto: SyncPullV2Dto, @CurrentUser() user: RequestUser) {
    return this.pullV2(SyncEntity.FORNECEDORES, dto, user);
  }

  @Get('v2/transportadoras') @RequirePermission('transportadoras.ver')
  pullTransportadorasV2(@Query() dto: SyncPullV2Dto, @CurrentUser() user: RequestUser) {
    return this.pullV2(SyncEntity.TRANSPORTADORAS, dto, user);
  }

  @Get('v2/pedidos') @RequirePermission('pedidos.ver')
  pullPedidosV2(@Query() dto: SyncPullV2Dto, @CurrentUser() user: RequestUser) {
    return this.pullV2(SyncEntity.PEDIDOS, dto, user);
  }

  @Get('v2/itens_pedido') @RequirePermission('pedidos.ver')
  pullItensPedidoV2(@Query() dto: SyncPullV2Dto, @CurrentUser() user: RequestUser) {
    return this.pullV2(SyncEntity.ITENS_PEDIDO, dto, user);
  }

  // ── PULL por entidade (CHANGELOG #8) ──────────────────────

  /**
   * GET /api/sync/<entidade>?since=<ISO>&cursor=0&limit=200
   * CHANGELOG #12: server_time dentro de meta — mobile usa como próximo cursor.
   * CHANGELOG #13: cursor é offset numérico simples.
   */
  @Get('clientes')
  @RequirePermission('clientes.ver')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async pullClientes(@Query() dto: SyncPullDto, @CurrentUser() user: RequestUser) {
    return this.syncService.pullEntity(Client, dto, user.tenantId);
  }

  @Get('pedidos')
  @RequirePermission('pedidos.ver')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async pullPedidos(@Query() dto: SyncPullDto, @CurrentUser() user: RequestUser) {
    return this.syncService.pullEntity(Order, dto, user.tenantId);
  }

  @Get('produtos')
  @RequirePermission('produtos.ver')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async pullProdutos(@Query() dto: SyncPullDto, @CurrentUser() user: RequestUser) {
    return this.syncService.pullEntity(Product, dto, user.tenantId);
  }

  @Get('fornecedores')
  @RequirePermission('fornecedores.ver')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async pullFornecedores(@Query() dto: SyncPullDto, @CurrentUser() user: RequestUser) {
    return this.syncService.pullEntity(Supplier, dto, user.tenantId);
  }

  @Get('transportadoras')
  @RequirePermission('transportadoras.ver')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async pullTransportadoras(@Query() dto: SyncPullDto, @CurrentUser() user: RequestUser) {
    return this.syncService.pullEntity(Transport, dto, user.tenantId);
  }

  @Get('itens-pedido')
  @RequirePermission('pedidos.ver')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async pullItensPedido(@Query() dto: SyncPullDto, @CurrentUser() user: RequestUser) {
    return this.syncService.pullEntity(OrderItem, dto, user.tenantId);
  }
}
