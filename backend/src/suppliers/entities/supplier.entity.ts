import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('fornecedores')
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'updated_at'])
@Index(['tenant_id', 'deleted_at'])
export class Supplier extends BaseEntity {
  @Column({ name: 'razao_social', type: 'varchar' })
  razao_social: string;

  @Column({ name: 'cnpj', type: 'varchar', nullable: true })
  cnpj: string | null;
}
