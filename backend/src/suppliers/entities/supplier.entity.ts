import { Column, Entity, Index } from 'typeorm';
import { VersionedBaseEntity } from '../../common/entities/versioned-base.entity';

@Entity('fornecedores')
@Index(['tenant_id', 'id'], { unique: true })
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'updated_at'])
@Index(['tenant_id', 'deleted_at'])
export class Supplier extends VersionedBaseEntity {
  @Column({ name: 'razao_social', type: 'varchar' })
  razao_social: string;

  @Column({ name: 'cnpj', type: 'varchar', nullable: true })
  cnpj: string | null;
}
