import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { VersionedBaseEntity } from '../../common/entities/versioned-base.entity';
import { Order } from '../../orders/entities/order.entity';

/**
 * Nota fiscal de faturamento — relação 1:N com pedido (um pedido pode ter
 * várias notas, parcial ou total). `status` do pedido é derivado da soma de
 * notas ativas (ver FaturamentoService#recalculateOrderStatus) — nunca
 * setado diretamente a partir daqui.
 */
@Entity('notas_fiscais')
@Index(['tenant_id', 'id'], { unique: true })
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'updated_at'])
@Index(['tenant_id', 'deleted_at'])
@Index(['tenant_id', 'pedido_id'])
export class NotaFiscal extends VersionedBaseEntity {
  @Column({ name: 'pedido_id', type: 'int' })
  pedido_id: number;

  @ManyToOne(() => Order, { nullable: false })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenant_id' },
    { name: 'pedido_id', referencedColumnName: 'id' },
  ])
  pedido: Order;

  @Column({ name: 'numero_nota', type: 'varchar' })
  numero_nota: string;

  @Column({ name: 'serie', type: 'varchar', nullable: true })
  serie: string | null;

  @Column({ name: 'valor', type: 'decimal', precision: 18, scale: 2 })
  valor: string;

  @Column({ name: 'data_emissao', type: 'date', nullable: true })
  data_emissao: string | null;

  @Column({ name: 'observacao', type: 'text', nullable: true })
  observacao: string | null;
}
