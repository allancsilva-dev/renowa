import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderItemPhoto } from './entities/order-item-photo.entity';
import { RequestUser } from '../common/types/jwt-payload.type';
import { isVendorOnly, vendorOwnershipWhere } from './order-ownership';
import { ProductPhotosService, ProductPhotoContent } from '../products/product-photos.service';
import { validateImageUpload } from '../common/images/image-validation';
import { optimisticSoftDelete } from '../common/persistence/optimistic-concurrency';

export type OrderItemPhotoMetadata = {
  uuid: string; version: number; nome_arquivo: string; mime_type: string;
  tamanho_bytes: number; created_at: Date;
};

@Injectable()
export class OrderItemPhotosService {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItemPhoto) private readonly photoRepo: Repository<OrderItemPhoto>,
    private readonly photosService: ProductPhotosService,
  ) {}

  private async loadOrder(uuid: string, user: RequestUser): Promise<Order> {
    const qb = this.orderRepo.createQueryBuilder('o')
      .where('o.uuid = :uuid', { uuid }).andWhere('o.tenant_id = :tenantId', { tenantId: user.tenantId })
      .andWhere('o.deleted_at IS NULL');
    if (isVendorOnly(user)) {
      const { sql, params } = vendorOwnershipWhere(user, 'o'); qb.andWhere(sql, params);
    }
    const order = await qb.getOne();
    if (!order) throw new NotFoundException(`Pedido ${uuid} não encontrado.`);
    return order;
  }

  private async loadItem(order: Order, itemUuid: string, tenantId: string): Promise<OrderItem> {
    const item = await this.orderRepo.manager.findOne(OrderItem, {
      where: { uuid: itemUuid, pedido_id: order.id, tenant_id: tenantId, deleted_at: IsNull() },
    });
    if (!item) throw new NotFoundException('Item do pedido não encontrado.');
    return item;
  }

  private metadata(photo: OrderItemPhoto): OrderItemPhotoMetadata {
    return { uuid: photo.uuid, version: photo.version, nome_arquivo: photo.nome_arquivo,
      mime_type: photo.mime_type, tamanho_bytes: photo.tamanho_bytes, created_at: photo.created_at };
  }

  async find(orderUuid: string, itemUuid: string, user: RequestUser): Promise<OrderItemPhotoMetadata | null> {
    const order = await this.loadOrder(orderUuid, user);
    const item = await this.loadItem(order, itemUuid, user.tenantId);
    const photo = await this.photoRepo.findOne({ where: { item_pedido_id: item.id, tenant_id: user.tenantId, deleted_at: IsNull() } });
    return photo ? this.metadata(photo) : null;
  }

  async upsert(orderUuid: string, itemUuid: string, file: Express.Multer.File | undefined, user: RequestUser): Promise<OrderItemPhotoMetadata> {
    const { buffer, mimeType } = validateImageUpload(file);
    const order = await this.loadOrder(orderUuid, user);
    const item = await this.loadItem(order, itemUuid, user.tenantId);
    const saved = await this.photoRepo.manager.transaction(async (manager) => {
      const lockedOrder = await manager.findOne(Order, { where: { id: order.id, tenant_id: user.tenantId, deleted_at: IsNull() }, lock: { mode: 'pessimistic_write' } });
      if (!lockedOrder) throw new NotFoundException(`Pedido ${orderUuid} não encontrado.`);
      if (lockedOrder.status !== 'em_aberto') throw new ConflictException('Pedido liberado não permite alterar fotos.');
      const locked = await manager.findOne(OrderItem, { where: { id: item.id, tenant_id: user.tenantId, deleted_at: IsNull() }, lock: { mode: 'pessimistic_write' } });
      if (!locked) throw new NotFoundException('Item do pedido não encontrado.');
      await manager.getRepository(OrderItemPhoto).createQueryBuilder().update().set({
        deleted_at: () => 'CURRENT_TIMESTAMP', version: () => '"version" + 1', conteudo: null, storage_backend: 'purgado',
      }).where('tenant_id = :tenantId AND item_pedido_id = :itemId AND deleted_at IS NULL', { tenantId: user.tenantId, itemId: item.id }).execute();
      return manager.save(manager.create(OrderItemPhoto, { tenant_id: user.tenantId, pedido_id: order.id,
        item_pedido_id: item.id, nome_arquivo: file?.originalname ?? 'foto', mime_type: mimeType,
        tamanho_bytes: buffer.length, conteudo: buffer, storage_backend: 'db' }));
    });
    return this.metadata(saved);
  }

  async remove(orderUuid: string, itemUuid: string, version: number, user: RequestUser): Promise<void> {
    const order = await this.loadOrder(orderUuid, user);
    const item = await this.loadItem(order, itemUuid, user.tenantId);
    const photo = await this.photoRepo.findOne({ where: { item_pedido_id: item.id, tenant_id: user.tenantId, deleted_at: IsNull() } });
    if (!photo) throw new NotFoundException('Item sem foto específica.');
    await this.photoRepo.manager.transaction(async (manager) => {
      const lockedOrder = await manager.findOne(Order, { where: { id: order.id, tenant_id: user.tenantId, deleted_at: IsNull() }, lock: { mode: 'pessimistic_write' } });
      if (!lockedOrder) throw new NotFoundException(`Pedido ${orderUuid} não encontrado.`);
      if (lockedOrder.status !== 'em_aberto') throw new ConflictException('Pedido liberado não permite alterar fotos.');
      await optimisticSoftDelete({ repository: manager.getRepository(OrderItemPhoto), uuid: photo.uuid,
        tenantId: user.tenantId, expectedVersion: version, resource: 'order-item-photo', notFoundMessage: 'Item sem foto específica.' });
      await manager.getRepository(OrderItemPhoto).createQueryBuilder().update()
        .set({ conteudo: null, storage_backend: 'purgado' })
        .where('uuid = :uuid AND tenant_id = :tenantId', { uuid: photo.uuid, tenantId: user.tenantId }).execute();
    });
  }

  async content(orderUuid: string, itemUuid: string, user: RequestUser): Promise<ProductPhotoContent> {
    const order = await this.loadOrder(orderUuid, user);
    const item = await this.loadItem(order, itemUuid, user.tenantId);
    const specific = await this.photoRepo.createQueryBuilder('f').addSelect('f.conteudo')
      .where('f.item_pedido_id = :itemId AND f.tenant_id = :tenantId AND f.deleted_at IS NULL', { itemId: item.id, tenantId: user.tenantId }).getOne();
    if (specific?.conteudo) return { buffer: specific.conteudo, mimeType: specific.mime_type, nomeArquivo: specific.nome_arquivo };
    if (item.produto_id == null) throw new NotFoundException('Item sem foto cadastrada.');
    return this.photosService.contentByProductId(item.produto_id, user.tenantId);
  }
}
