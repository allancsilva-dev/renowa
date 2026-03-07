import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('fornecedores')
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'updated_at'])
export class Supplier extends BaseEntity {
  @Column({ name: 'razao_social', type: 'varchar', length: 255 })
  razao_social: string;

  @Column({ name: 'nome_fantasia', type: 'varchar', length: 255, nullable: true })
  nome_fantasia: string | null;

  @Column({ name: 'cnpj', type: 'varchar', length: 20, nullable: true })
  cnpj: string | null;

  @Column({ name: 'email', type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ name: 'telefone', type: 'varchar', length: 30, nullable: true })
  telefone: string | null;

  @Column({ name: 'contato', type: 'varchar', length: 255, nullable: true })
  contato: string | null;

  @Column({ name: 'endereco', type: 'jsonb', nullable: true })
  endereco: Record<string, string> | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  is_active: boolean;
}
