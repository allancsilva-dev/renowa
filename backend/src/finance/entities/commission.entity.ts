import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Order } from '../../orders/entities/order.entity';

/**
 * valor_comissao: snapshot imutável calculado no lançamento.
 * NUNCA recalculado retroativamente.
 * Sem soft delete — comissões são registros imutáveis.
 */
@Entity('comissoes')
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'updated_at'])
@Index(['tenant_id', 'pedido_id'])
export class Commission extends BaseEntity {
  @Column({ name: 'pedido_id', type: 'int', nullable: true })
  pedido_id: number | null;

  @ManyToOne(() => Order, { nullable: true })
  @JoinColumn({ name: 'pedido_id' })
  pedido: Order | null;

  @Column({ name: 'nfe', type: 'varchar', nullable: true })
  nfe: string | null;

  @Column({ name: 'valor_faturado', type: 'decimal', precision: 10, scale: 2, nullable: true })
  valor_faturado: number | null;

  @Column({ name: 'perc_comissao', type: 'decimal', precision: 5, scale: 2, nullable: true })
  perc_comissao: number | null;

  /** Snapshot imutável — calculado no lançamento, nunca atualizado */
  @Column({ name: 'valor_comissao', type: 'decimal', precision: 10, scale: 2 })
  valor_comissao: number;

  @Column({ name: 'data_faturamento', type: 'date', nullable: true })
  data_faturamento: string | null;
}
