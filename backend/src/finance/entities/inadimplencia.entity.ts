import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Client } from '../../clients/entities/client.entity';

@Entity('inadimplencia')
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'cliente_id'])
@Index(['tenant_id', 'updated_at'])
@Index(['tenant_id', 'deleted_at'])
export class Inadimplencia extends BaseEntity {
  @Column({ name: 'cliente_id', type: 'int', nullable: true })
  cliente_id: number | null;

  @ManyToOne(() => Client, { nullable: true })
  @JoinColumn({ name: 'cliente_id' })
  cliente: Client | null;

  @Column({ name: 'empresa_devedora', type: 'varchar', nullable: true })
  empresa_devedora: string | null;

  @Column({ name: 'valor_aberto', type: 'decimal', precision: 10, scale: 2, nullable: true })
  valor_aberto: number | null;

  @Column({ name: 'observacao', type: 'text', nullable: true })
  observacao: string | null;
}
