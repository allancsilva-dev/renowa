import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SyncService } from './sync.service';
import { SyncPushDto, SyncPullDto } from './dto/sync.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { Client } from '../clients/entities/client.entity';
import { Order } from '../orders/entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Transport } from '../transport/entities/transport.entity';

/**
 * CHANGELOG #8: Endpoints separados por entidade (sync por entidade).
 * CHANGELOG #11: POST /api/sync com rate limit específico.
 */
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

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
  ) {
    return this.syncService.pushItems(dto.items, user.tenantId);
  }

  // ── PULL por entidade (CHANGELOG #8) ──────────────────────

  /**
   * GET /api/sync/clientes?since=<ISO>&page=1&limit=100
   * CHANGELOG #12: server_time retornado em todo response de sync.
   */
  @Get('clientes')
  async pullClientes(@Query() dto: SyncPullDto, @CurrentUser() user: RequestUser) {
    return this.syncService.pullEntity(Client, dto, user.tenantId);
  }

  @Get('pedidos')
  async pullPedidos(@Query() dto: SyncPullDto, @CurrentUser() user: RequestUser) {
    return this.syncService.pullEntity(Order, dto, user.tenantId);
  }

  @Get('produtos')
  async pullProdutos(@Query() dto: SyncPullDto, @CurrentUser() user: RequestUser) {
    return this.syncService.pullEntity(Product, dto, user.tenantId);
  }

  @Get('fornecedores')
  async pullFornecedores(@Query() dto: SyncPullDto, @CurrentUser() user: RequestUser) {
    return this.syncService.pullEntity(Supplier, dto, user.tenantId);
  }

  @Get('transportadoras')
  async pullTransportadoras(@Query() dto: SyncPullDto, @CurrentUser() user: RequestUser) {
    return this.syncService.pullEntity(Transport, dto, user.tenantId);
  }
}
