import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { VersionedBaseEntity } from '../../common/entities/versioned-base.entity';
import { Transport } from '../../transport/entities/transport.entity';

@Entity('clientes')
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'updated_at'])
@Index(['tenant_id', 'deleted_at'])
export class Client extends VersionedBaseEntity {
  @Column({ name: 'razao_social', type: 'varchar' })
  razao_social: string;

  @Column({ name: 'cnpj', type: 'varchar', nullable: true })
  cnpj: string | null;

  @Column({ name: 'email', type: 'varchar', nullable: true })
  email: string | null;

  @Column({ name: 'tel', type: 'varchar', nullable: true })
  tel: string | null;

  @Column({ name: 'endereco', type: 'varchar', nullable: true })
  endereco: string | null;

  @Column({ name: 'bairro', type: 'varchar', nullable: true })
  bairro: string | null;

  @Column({ name: 'cidade', type: 'varchar', nullable: true })
  cidade: string | null;

  @Column({ name: 'uf', type: 'varchar', length: 2, nullable: true })
  uf: string | null;

  @Column({ name: 'cep', type: 'varchar', nullable: true })
  cep: string | null;

  @Column({ name: 'contato', type: 'varchar', nullable: true })
  contato: string | null;

  @Column({ name: 'inscricao_estadual', type: 'varchar', nullable: true })
  inscricao_estadual: string | null;

  @Column({ name: 'suframa', type: 'varchar', nullable: true })
  suframa: string | null;

  @Column({ name: 'pgt_padrao', type: 'varchar', nullable: true })
  pgt_padrao: string | null;

  @Column({ name: 'prazo', type: 'varchar', nullable: true })
  prazo: string | null;

  @Column({ name: 'local_entrega', type: 'varchar', nullable: true })
  local_entrega: string | null;

  @Column({ name: 'observacao', type: 'text', nullable: true })
  observacao: string | null;

  @Column({ name: 'transportadora_id', type: 'int', nullable: true })
  transportadora_id: number | null;

  @ManyToOne(() => Transport, { nullable: true })
  @JoinColumn({ name: 'transportadora_id' })
  transportadora: Transport | null;
}
