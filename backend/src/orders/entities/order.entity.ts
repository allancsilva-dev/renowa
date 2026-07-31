import { Column, Entity, Index, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { VersionedBaseEntity } from '../../common/entities/versioned-base.entity';
import { Client } from '../../clients/entities/client.entity';
import { Transport } from '../../transport/entities/transport.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';
import { OrderItem } from './order-item.entity';
import { User } from '../../users/entities/user.entity';

/** Espelha `pedidos_origem_check` (0033). */
export const ORDER_ORIGENS = ['interno', 'externo'] as const;

/** Espelha `pedidos_status_check` (0027). */
export const ORDER_STATUSES = [
  'em_aberto', 'liberado', 'parcialmente_faturado', 'faturado', 'cancelado',
] as const;

/**
 * Spec: status VARCHAR 'em_aberto' | 'concluido' | 'cancelado'
 * numero_pedido NULL até sync — gerado exclusivamente pelo servidor via SEQUENCE global.
 * CHANGELOG #9: UNIQUE(tenant_id, numero_pedido) — NUNCA UNIQUE simples.
 */
@Entity('pedidos')
@Index(['tenant_id', 'id'], { unique: true })
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'numero_pedido'], { unique: true, where: 'numero_pedido IS NOT NULL' })
@Index(['tenant_id', 'updated_at'])
@Index(['tenant_id', 'status'])
@Index(['tenant_id', 'data'])
@Index(['tenant_id', 'origem'])
export class Order extends VersionedBaseEntity {
  /**
   * 'interno' (pedido digitado aqui, com itens) | 'externo' (pedido digitado
   * em sistema de terceiro, sem itens — só número de origem, sistema e valor).
   * CHECK (pedidos_origem_check + pedidos_origem_externa_check, migration 0033)
   * garante a forma de cada origem no banco, não só no DTO.
   * Nunca vem do corpo da requisição: é derivado do endpoint usado.
   */
  @Column({ name: 'origem', type: 'varchar', default: 'interno' })
  origem: string;

  /** Número do pedido no sistema de origem. Só em `origem = 'externo'`. */
  @Column({ name: 'numero_pedido_externo', type: 'varchar', nullable: true })
  numero_pedido_externo: string | null;

  /** Nome do sistema onde o pedido foi digitado. Só em `origem = 'externo'`. */
  @Column({ name: 'sistema_origem', type: 'varchar', nullable: true })
  sistema_origem: string | null;

  /**
   * Gerado EXCLUSIVAMENTE pelo servidor via nextval('pedidos_numero_seq').
   * NULL enquanto o pedido não foi sincronizado (criado offline no mobile).
   * NUNCA gerado no mobile.
   */
  @Column({ name: 'numero_pedido', type: 'int', nullable: true, default: null })
  numero_pedido: number | null;

  @Column({ name: 'cliente_id', type: 'int', nullable: true })
  cliente_id: number | null;

  @ManyToOne(() => Client, { nullable: true })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenant_id' },
    { name: 'cliente_id', referencedColumnName: 'id' },
  ])
  cliente: Client | null;

  @Column({ name: 'vendedor_id', type: 'int', nullable: true })
  vendedor_id: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenant_id' },
    { name: 'vendedor_id', referencedColumnName: 'id' },
  ])
  vendedor: User | null;

  @Column({ name: 'fornecedor_id', type: 'int', nullable: true })
  fornecedor_id: number | null;

  @ManyToOne(() => Supplier, { nullable: true })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenant_id' },
    { name: 'fornecedor_id', referencedColumnName: 'id' },
  ])
  fornecedor: Supplier | null;

  @Column({ name: 'transportadora_id', type: 'int', nullable: true })
  transportadora_id: number | null;

  @ManyToOne(() => Transport, { nullable: true })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenant_id' },
    { name: 'transportadora_id', referencedColumnName: 'id' },
  ])
  transportadora: Transport | null;

  @Column({ name: 'data', type: 'date', nullable: true })
  data: string | null;

  /**
   * 'em_aberto' | 'liberado' | 'parcialmente_faturado' | 'faturado' | 'cancelado'.
   * 'parcialmente_faturado'/'faturado' são derivados exclusivamente pelo
   * faturamento (soma de notas fiscais ativas) — nunca setados manualmente.
   * CHECK (pedidos_status_check, migration 0027) trava os 5 valores no banco.
   */
  @Column({ name: 'status', type: 'varchar', default: 'em_aberto' })
  status: string;

  @Column({ name: 'total_sem_imposto', type: 'decimal', precision: 18, scale: 2, nullable: true })
  total_sem_imposto: string | null;

  @Column({ name: 'total_com_imposto', type: 'decimal', precision: 18, scale: 2, nullable: true })
  total_com_imposto: string | null;

  @Column({ name: 'pgt', type: 'varchar', nullable: true })
  pgt: string | null;

  @Column({ name: 'prazo', type: 'varchar', nullable: true })
  prazo: string | null;

  @Column({ name: 'local_entrega', type: 'varchar', nullable: true })
  local_entrega: string | null;

  @Column({ name: 'observacao', type: 'text', nullable: true })
  observacao: string | null;

  @Column({ name: 'tipo_faturamento', type: 'varchar', nullable: true })
  tipo_faturamento: string | null;

  @OneToMany(() => OrderItem, (item) => item.pedido, { cascade: true })
  itens: OrderItem[];
}
