import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { VersionedBaseEntity } from '../../common/entities/versioned-base.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';

@Entity('produtos')
@Index(['tenant_id', 'id'], { unique: true })
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'updated_at'])
@Index(['tenant_id', 'deleted_at'])
export class Product extends VersionedBaseEntity {
  @Column({ name: 'fornecedor_id', type: 'int', nullable: true })
  fornecedor_id: number | null;

  @ManyToOne(() => Supplier, { nullable: true })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenant_id' },
    { name: 'fornecedor_id', referencedColumnName: 'id' },
  ])
  fornecedor: Supplier | null;

  @Column({ name: 'codigo', type: 'varchar', nullable: true })
  codigo: string | null;

  @Column({ name: 'descricao', type: 'varchar' })
  descricao: string;

  @Column({ name: 'preco_base', type: 'decimal', precision: 10, scale: 2, nullable: true })
  preco_base: string | null;

  @Column({ name: 'ipi_perc', type: 'decimal', precision: 5, scale: 2, nullable: true })
  ipi_perc: string | null;
}
