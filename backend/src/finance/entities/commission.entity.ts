import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { VersionedBaseEntity } from '../../common/entities/versioned-base.entity';
import { Client } from '../../clients/entities/client.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';

/**
 * valor_comissao: snapshot imutável calculado no lançamento.
 * NUNCA recalculado retroativamente.
 */
@Entity('comissoes')
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'updated_at'])
@Index(['tenant_id', 'deleted_at'])
@Index(['tenant_id', 'data_pedido'])
@Index(['tenant_id', 'status'])
@Index(['tenant_id', 'fornecedor_id'])
export class Commission extends VersionedBaseEntity {
  // Relacionamentos opcionais
  @Column({ name: 'cliente_id', type: 'int', nullable: true })
  cliente_id: number | null;

  @ManyToOne(() => Client, { nullable: true })
  @JoinColumn({ name: 'cliente_id' })
  cliente: Client | null;

  @Column({ name: 'fornecedor_id', type: 'int', nullable: true })
  fornecedor_id: number | null;

  @ManyToOne(() => Supplier, { nullable: true })
  @JoinColumn({ name: 'fornecedor_id' })
  fornecedor: Supplier | null;

  // Dados do pedido/NF
  @Column({ name: 'numero_pedido', type: 'varchar', nullable: true })
  numero_pedido: string | null;

  @Column({ name: 'numero_nfe', type: 'varchar', nullable: true })
  numero_nfe: string | null;

  // Datas
  @Column({ name: 'data_pedido', type: 'date', nullable: true })
  data_pedido: string | null;

  @Column({ name: 'data_faturamento', type: 'date', nullable: true })
  data_faturamento: string | null;

  // Valores
  @Column({ name: 'valor_pedido', type: 'decimal', precision: 12, scale: 2, nullable: true })
  valor_pedido: number | null;

  @Column({ name: 'valor_faturado', type: 'decimal', precision: 12, scale: 2, nullable: true })
  valor_faturado: number | null;

  @Column({ name: 'perc_comissao', type: 'decimal', precision: 5, scale: 2, nullable: true })
  perc_comissao: number | null;

  /** Snapshot imutável — calculado no lançamento */
  @Column({ name: 'valor_comissao', type: 'decimal', precision: 12, scale: 2, default: 0 })
  valor_comissao: number;

  /** 'pendente' | 'faturado' | 'pago' */
  @Column({ name: 'status', type: 'varchar', default: 'pendente' })
  status: string;
}
