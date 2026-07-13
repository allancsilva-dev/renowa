import {
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Generated,
} from 'typeorm';

/**
 * Entidade base para todas as tabelas do sistema.
 *
 * Regras de segurança (multi-tenant):
 * - tenant_id: OBRIGATÓRIO em todas as tabelas — isolamento entre tenants
 * - uuid: identificador público — mobile usa uuid, nunca expor o id interno
 * - deleted_at: soft delete — dados nunca são apagados fisicamente
 *
 * CHANGELOG #9: tenant_id em todas as tabelas sem exceção
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'uuid' })
  @Generated('uuid')
  uuid: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenant_id: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date;

  // Autoridade exclusiva do PostgreSQL: DEFAULT + trigger set_updated_at().
  @Column({
    name: 'updated_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    insert: false,
    update: false,
  })
  updated_at: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deleted_at: Date | null;
}
