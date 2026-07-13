import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { VersionedBaseEntity } from '../../common/entities/versioned-base.entity';
import { Order } from './order.entity';
import { Product } from '../../products/entities/product.entity';

@Entity('itens_pedido')
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'pedido_id'])
@Index(['tenant_id', 'updated_at'])
@Index(['tenant_id', 'deleted_at'])
export class OrderItem extends VersionedBaseEntity {
  @Column({ name: 'pedido_id', type: 'int' })
  pedido_id: number;

  @ManyToOne(() => Order, (order) => order.itens)
  @JoinColumn({ name: 'pedido_id' })
  pedido: Order;

  /** produto_id nullable — item pode ser produto manual sem cadastro */
  @Column({ name: 'produto_id', type: 'int', nullable: true })
  produto_id: number | null;

  @ManyToOne(() => Product, { nullable: true })
  @JoinColumn({ name: 'produto_id' })
  produto: Product | null;

  /** Código manual quando não há produto cadastrado */
  @Column({ name: 'codigo_manual', type: 'varchar', nullable: true })
  codigo_manual: string | null;

  /** Descrição manual quando não há produto cadastrado */
  @Column({ name: 'descricao_manual', type: 'varchar', nullable: true })
  descricao_manual: string | null;

  @Column({ name: 'qtd_caixas', type: 'decimal', precision: 10, scale: 3, nullable: true })
  qtd_caixas: number | null;

  @Column({ name: 'qtd_unitaria', type: 'decimal', precision: 10, scale: 3, nullable: true })
  qtd_unitaria: number | null;

  @Column({ name: 'preco_unitario', type: 'decimal', precision: 10, scale: 2, nullable: true })
  preco_unitario: number | null;

  @Column({ name: 'desconto_perc', type: 'decimal', precision: 5, scale: 2, nullable: true })
  desconto_perc: number | null;

  @Column({ name: 'total_item', type: 'decimal', precision: 10, scale: 2, nullable: true })
  total_item: number | null;
}
