import { Column, Entity, Index, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { VersionedBaseEntity } from '../../common/entities/versioned-base.entity';
import { Client } from '../../clients/entities/client.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';
import { SacTicketItem } from './sac-ticket-item.entity';

/**
 * Chamado de SAC. Mesma forma do pedido (cabeçalho + itens + numeração
 * sequencial + papel impresso), mas domínio separado: chamado NÃO gera nota
 * fiscal nem comissão.
 *
 * `numero_chamado` é gerado EXCLUSIVAMENTE pelo servidor via
 * nextval('sac_numero_seq'). UNIQUE(tenant_id, numero_chamado) parcial —
 * nunca UNIQUE simples, que seria global entre tenants.
 */
@Entity('chamados_sac')
@Index(['tenant_id', 'id'], { unique: true })
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'updated_at'])
@Index(['tenant_id', 'deleted_at'])
@Index(['tenant_id', 'status'])
export class SacTicket extends VersionedBaseEntity {
  @Column({ name: 'numero_chamado', type: 'int' })
  numero_chamado: number;

  @Column({ name: 'cliente_id', type: 'int' })
  cliente_id: number;

  @ManyToOne(() => Client)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenant_id' },
    { name: 'cliente_id', referencedColumnName: 'id' },
  ])
  cliente: Client;

  /** "Importador" no vocabulário do negócio é o fornecedor cadastrado. */
  @Column({ name: 'fornecedor_id', type: 'int' })
  fornecedor_id: number;

  @ManyToOne(() => Supplier)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenant_id' },
    { name: 'fornecedor_id', referencedColumnName: 'id' },
  ])
  fornecedor: Supplier;

  @Column({ name: 'numero_nfe', type: 'varchar', nullable: true })
  numero_nfe: string | null;

  @Column({ name: 'data', type: 'date', nullable: true })
  data: string | null;

  /** Soma dos itens ativos — derivada pelo servidor, nunca enviada pelo cliente. */
  @Column({ name: 'total', type: 'decimal', precision: 18, scale: 2, nullable: true })
  total: string | null;

  /**
   * 'aberto' | 'em_andamento' | 'resolvido' | 'cancelado'.
   * CHECK (chamados_sac_status_check, migration 0035) trava os 4 no banco.
   * Nunca é campo de entrada: transição só por PATCH /sac/:uuid/status.
   */
  @Column({ name: 'status', type: 'varchar', default: 'aberto' })
  status: string;

  @Column({ name: 'observacao', type: 'text', nullable: true })
  observacao: string | null;

  @OneToMany(() => SacTicketItem, (item) => item.chamado, { cascade: true })
  itens: SacTicketItem[];
}
