import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { VersionedBaseEntity } from '../../common/entities/versioned-base.entity';
import { Order } from '../../orders/entities/order.entity';
import { User } from '../../users/entities/user.entity';

@Entity('faturamento_finalizacoes')
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'pedido_id'])
export class FaturamentoFinalizacao extends VersionedBaseEntity {
  @Column({ name: 'pedido_id', type: 'int' })
  pedido_id: number;

  @ManyToOne(() => Order, { nullable: false })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenant_id' },
    { name: 'pedido_id', referencedColumnName: 'id' },
  ])
  pedido: Order;

  @Column({ name: 'saldo_encerrado', type: 'decimal', precision: 18, scale: 2 })
  saldo_encerrado: string;

  @Column({ name: 'motivo', type: 'text' })
  motivo: string;

  @Column({ name: 'finalizado_por', type: 'uuid' })
  finalizado_por: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenant_id' },
    { name: 'finalizado_por', referencedColumnName: 'uuid' },
  ])
  finalizadoPor: User;

  @Column({ name: 'reaberto_at', type: 'timestamptz', nullable: true })
  reaberto_at: Date | null;

  @Column({ name: 'reaberto_por', type: 'uuid', nullable: true })
  reaberto_por: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenant_id' },
    { name: 'reaberto_por', referencedColumnName: 'uuid' },
  ])
  reabertoPor: User | null;

  @Column({ name: 'reabertura_motivo', type: 'text', nullable: true })
  reabertura_motivo: string | null;
}
