import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { RequestUser } from '../common/types/jwt-payload.type';
import { isVendorOnly, vendorOwnershipWhere } from './order-ownership';
import { ProductPhotosService, ProductPhotoContent } from '../products/product-photos.service';

/**
 * Resolve item do pedido → produto → foto do catálogo.
 *
 * Herdou de `OrderPhotosService` (removido) a regra que importava: o pedido é
 * carregado com tenant e ownership de vendedor, e pedido de outro vendedor
 * devolve 404 e nunca 403 — não vazar existência é a mesma regra do
 * `OrdersService`.
 */
@Injectable()
export class OrderItemPhotosService {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    private readonly photosService: ProductPhotosService,
  ) {}

  private async loadOrder(uuid: string, user: RequestUser): Promise<Order> {
    const qb = this.orderRepo.createQueryBuilder('o')
      .where('o.uuid = :uuid', { uuid })
      .andWhere('o.tenant_id = :tenantId', { tenantId: user.tenantId })
      .andWhere('o.deleted_at IS NULL');
    if (isVendorOnly(user)) {
      const { sql, params } = vendorOwnershipWhere(user, 'o');
      qb.andWhere(sql, params);
    }
    const order = await qb.getOne();
    if (!order) throw new NotFoundException(`Pedido ${uuid} não encontrado.`);
    return order;
  }

  async content(orderUuid: string, itemUuid: string, user: RequestUser): Promise<ProductPhotoContent> {
    const order = await this.loadOrder(orderUuid, user);
    const rows = await this.orderRepo.manager.query(
      `SELECT produto_id FROM itens_pedido
        WHERE uuid = $1 AND pedido_id = $2 AND tenant_id = $3 AND deleted_at IS NULL`,
      [itemUuid, order.id, user.tenantId],
    ) as Array<{ produto_id: number | null }>;

    // Item manual (`produto_id` nulo) não tem foto — é o mesmo 404 de produto
    // sem foto, e o papel imprime a célula vazia.
    const produtoId = rows[0]?.produto_id;
    if (produtoId == null) throw new NotFoundException('Item sem foto de produto.');

    return this.photosService.contentByProductId(produtoId, user.tenantId);
  }
}
