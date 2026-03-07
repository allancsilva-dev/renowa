import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('transportadoras')
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'updated_at'])
@Index(['tenant_id', 'deleted_at'])
export class Transport extends BaseEntity {
  @Column({ name: 'razao_social', type: 'varchar' })
  razao_social: string;

  @Column({ name: 'cnpj', type: 'varchar', nullable: true })
  cnpj: string | null;

  @Column({ name: 'telefone', type: 'varchar', nullable: true })
  telefone: string | null;

  @Column({ name: 'endereco_completo', type: 'text', nullable: true })
  endereco_completo: string | null;
}
