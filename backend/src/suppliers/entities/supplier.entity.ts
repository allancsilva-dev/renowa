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

  @Column({ name: 'endereco', type: 'varchar', nullable: true })
  endereco: string | null;

  @Column({ name: 'numero', type: 'varchar', nullable: true })
  numero: string | null;

  @Column({ name: 'complemento', type: 'varchar', nullable: true })
  complemento: string | null;

  @Column({ name: 'bairro', type: 'varchar', nullable: true })
  bairro: string | null;

  @Column({ name: 'cidade', type: 'varchar', nullable: true })
  cidade: string | null;

  @Column({ name: 'uf', type: 'varchar', length: 2, nullable: true })
  uf: string | null;

  @Column({ name: 'cep', type: 'varchar', nullable: true })
  cep: string | null;

  @Column({ name: 'telefone', type: 'varchar', nullable: true })
  telefone: string | null;

  @Column({ name: 'inscricao_estadual', type: 'varchar', nullable: true })
  inscricao_estadual: string | null;
}
