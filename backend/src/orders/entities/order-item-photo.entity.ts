import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { VersionedBaseEntity } from '../../common/entities/versioned-base.entity';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';

@Entity('pedido_item_fotos')
@Index(['tenant_id', 'id'], { unique: true })
@Index(['tenant_id', 'uuid'], { unique: true })
export class OrderItemPhoto extends VersionedBaseEntity {
  @Column({ type: 'int' }) pedido_id: number;
  @Column({ type: 'int' }) item_pedido_id: number;
  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'tenant_id', referencedColumnName: 'tenant_id' }, { name: 'pedido_id', referencedColumnName: 'id' }])
  pedido: Order;
  @ManyToOne(() => OrderItem, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'tenant_id', referencedColumnName: 'tenant_id' }, { name: 'item_pedido_id', referencedColumnName: 'id' }])
  item: OrderItem;
  @Column({ type: 'varchar' }) nome_arquivo: string;
  @Column({ type: 'varchar' }) mime_type: string;
  @Column({ type: 'int' }) tamanho_bytes: number;
  @Column({ type: 'bytea', nullable: true, select: false }) conteudo: Buffer | null;
  @Column({ type: 'varchar', default: 'db' }) storage_backend: string;
}
