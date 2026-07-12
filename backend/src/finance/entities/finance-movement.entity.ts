import { Column, Entity, Index } from 'typeorm';
import { VersionedBaseEntity } from '../../common/entities/versioned-base.entity';

/**
 * Spec: tipo VARCHAR 'Custo Fixo' | 'Custo Rotativo' | 'Venda'
 * (não enum — valores vêm do domínio do cliente)
 */
@Entity('financeiro_movimentacao')
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'updated_at'])
@Index(['tenant_id', 'deleted_at'])
export class FinanceMovement extends VersionedBaseEntity {
  /** 'Custo Fixo' | 'Custo Rotativo' | 'Venda' */
  @Column({ name: 'tipo', type: 'varchar' })
  tipo: string;

  @Column({ name: 'valor', type: 'decimal', precision: 10, scale: 2 })
  valor: number;

  @Column({ name: 'data', type: 'date', nullable: true })
  data: string | null;

  @Column({ name: 'descricao', type: 'varchar', nullable: true })
  descricao: string | null;
}
