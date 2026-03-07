import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Order } from './order.entity';
import { Product } from '../../products/entities/product.entity';

@Entity('itens_pedido')
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'pedido_id'])
export class OrderItem extends BaseEntity {
  @Column({ name: 'pedido_id', type: 'int' })
  pedido_id: number;

  @ManyToOne(() => Order, (order) => order.itens)
  @JoinColumn({ name: 'pedido_id' })
  pedido: Order;

  @Column({ name: 'produto_id', type: 'int' })
  produto_id: number;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'produto_id' })
  produto: Product;

  @Column({ name: 'quantidade', type: 'decimal', precision: 15, scale: 3 })
  quantidade: number;

  @Column({ name: 'preco_unitario', type: 'decimal', precision: 15, scale: 4 })
  preco_unitario: number;

  @Column({ name: 'desconto_percentual', type: 'decimal', precision: 5, scale: 2, default: 0 })
  desconto_percentual: number;

  @Column({ name: 'valor_total', type: 'decimal', precision: 15, scale: 2 })
  valor_total: number;

  @Column({ name: 'observacoes', type: 'varchar', length: 500, nullable: true })
  observacoes: string | null;
}
