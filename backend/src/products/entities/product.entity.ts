import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';

@Entity('produtos')
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'updated_at'])
@Index(['tenant_id', 'codigo'])
export class Product extends BaseEntity {
  @Column({ name: 'codigo', type: 'varchar', length: 100, nullable: true })
  codigo: string | null;

  @Column({ name: 'descricao', type: 'varchar', length: 500 })
  descricao: string;

  @Column({ name: 'unidade', type: 'varchar', length: 10, default: 'UN' })
  unidade: string;

  @Column({ name: 'preco_venda', type: 'decimal', precision: 15, scale: 4 })
  preco_venda: number;

  @Column({ name: 'preco_custo', type: 'decimal', precision: 15, scale: 4, nullable: true })
  preco_custo: number | null;

  @Column({ name: 'estoque_atual', type: 'decimal', precision: 15, scale: 3, default: 0 })
  estoque_atual: number;

  @Column({ name: 'estoque_minimo', type: 'decimal', precision: 15, scale: 3, nullable: true })
  estoque_minimo: number | null;

  @Column({ name: 'fornecedor_id', type: 'int', nullable: true })
  fornecedor_id: number | null;

  @ManyToOne(() => Supplier, { nullable: true })
  @JoinColumn({ name: 'fornecedor_id' })
  fornecedor: Supplier | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  is_active: boolean;

  @Column({ name: 'observacoes', type: 'text', nullable: true })
  observacoes: string | null;
}
