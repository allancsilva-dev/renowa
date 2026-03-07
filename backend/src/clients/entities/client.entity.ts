import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('clientes')
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'updated_at'])
@Index(['tenant_id', 'deleted_at'])
export class Client extends BaseEntity {
  @Column({ name: 'razao_social', type: 'varchar', length: 255 })
  razao_social: string;

  @Column({ name: 'nome_fantasia', type: 'varchar', length: 255, nullable: true })
  nome_fantasia: string | null;

  @Column({ name: 'cnpj_cpf', type: 'varchar', length: 20, nullable: true })
  cnpj_cpf: string | null;

  @Column({ name: 'email', type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ name: 'telefone', type: 'varchar', length: 30, nullable: true })
  telefone: string | null;

  @Column({ name: 'endereco', type: 'jsonb', nullable: true })
  endereco: {
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade?: string;
    estado?: string;
    cep?: string;
  } | null;

  @Column({ name: 'observacoes', type: 'text', nullable: true })
  observacoes: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  is_active: boolean;

  @Column({ name: 'limite_credito', type: 'decimal', precision: 15, scale: 2, nullable: true })
  limite_credito: number | null;
}
