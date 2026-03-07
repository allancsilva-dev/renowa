import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Client } from '../../clients/entities/client.entity';
import { FinanceMovement } from './finance-movement.entity';

@Entity('inadimplencia')
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'cliente_id'])
@Index(['tenant_id', 'updated_at'])
export class Inadimplencia extends BaseEntity {
  @Column({ name: 'cliente_id', type: 'int' })
  cliente_id: number;

  @ManyToOne(() => Client)
  @JoinColumn({ name: 'cliente_id' })
  cliente: Client;

  @Column({ name: 'movimentacao_id', type: 'int' })
  movimentacao_id: number;

  @ManyToOne(() => FinanceMovement)
  @JoinColumn({ name: 'movimentacao_id' })
  movimentacao: FinanceMovement;

  @Column({ name: 'valor_original', type: 'decimal', precision: 15, scale: 2 })
  valor_original: number;

  @Column({ name: 'valor_atualizado', type: 'decimal', precision: 15, scale: 2 })
  valor_atualizado: number;

  @Column({ name: 'dias_atraso', type: 'int', default: 0 })
  dias_atraso: number;

  @Column({ name: 'resolvido_em', type: 'timestamptz', nullable: true })
  resolvido_em: Date | null;
}
