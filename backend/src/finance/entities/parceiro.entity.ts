import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { VersionedBaseEntity } from '../../common/entities/versioned-base.entity';
import { Client } from '../../clients/entities/client.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';

@Entity('parceiros_comerciais')
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'updated_at'])
@Index(['tenant_id', 'deleted_at'])
@Index(['tenant_id', 'nome_parceiro'])
export class Parceiro extends VersionedBaseEntity {
  @Column({ name: 'nome_parceiro', type: 'varchar' })
  nome_parceiro: string;

  @Column({ name: 'empresa_parceiro', type: 'varchar', nullable: true })
  empresa_parceiro: string | null;

  @Column({ name: 'cliente_id', type: 'int', nullable: true })
  cliente_id: number | null;

  @ManyToOne(() => Client, { nullable: true })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenant_id' },
    { name: 'cliente_id', referencedColumnName: 'id' },
  ])
  cliente: Client | null;

  @Column({ name: 'fornecedor_id', type: 'int', nullable: true })
  fornecedor_id: number | null;

  @ManyToOne(() => Supplier, { nullable: true })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenant_id' },
    { name: 'fornecedor_id', referencedColumnName: 'id' },
  ])
  fornecedor: Supplier | null;

  @Column({ name: 'numero_pedido', type: 'varchar', nullable: true })
  numero_pedido: string | null;

  @Column({ name: 'numero_nfe', type: 'varchar', nullable: true })
  numero_nfe: string | null;

  @Column({ name: 'data_pedido', type: 'date' })
  data_pedido: string;

  @Column({ name: 'data_faturamento', type: 'date', nullable: true })
  data_faturamento: string | null;

  @Column({ name: 'valor_pedido', type: 'decimal', precision: 12, scale: 2, default: 0 })
  valor_pedido: string;

  @Column({ name: 'valor_faturado', type: 'decimal', precision: 12, scale: 2, nullable: true })
  valor_faturado: string | null;

  /** Default 50% — divisão com o parceiro */
  @Column({ name: 'percentual_comissao', type: 'decimal', precision: 5, scale: 2, default: 50 })
  percentual_comissao: string;

  @Column({ name: 'valor_comissao', type: 'decimal', precision: 12, scale: 2, default: 0 })
  valor_comissao: string;

  /** 'pendente' | 'faturado' | 'pago' */
  @Column({ name: 'status', type: 'varchar', default: 'pendente' })
  status: string;
}
