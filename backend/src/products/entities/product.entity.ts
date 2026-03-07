import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';

@Entity('produtos')
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'updated_at'])
@Index(['tenant_id', 'deleted_at'])
export class Product extends BaseEntity {
  @Column({ name: 'fornecedor_id', type: 'int', nullable: true })
  fornecedor_id: number | null;

  @ManyToOne(() => Supplier, { nullable: true })
  @JoinColumn({ name: 'fornecedor_id' })
  fornecedor: Supplier | null;

  @Column({ name: 'codigo', type: 'varchar', nullable: true })
  codigo: string | null;

  @Column({ name: 'descricao', type: 'varchar' })
  descricao: string;

  @Column({ name: 'preco_base', type: 'decimal', precision: 10, scale: 2, nullable: true })
  preco_base: number | null;
}
