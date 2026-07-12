import { Column, Entity, Index, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { VersionedBaseEntity } from '../../common/entities/versioned-base.entity';
import { Client } from '../../clients/entities/client.entity';
import { Transport } from '../../transport/entities/transport.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';
import { OrderItem } from './order-item.entity';

/**
 * Spec: status VARCHAR 'em_aberto' | 'concluido' | 'cancelado'
 * numero_pedido NULL até sync — gerado exclusivamente pelo servidor via SEQUENCE global.
 * CHANGELOG #9: UNIQUE(tenant_id, numero_pedido) — NUNCA UNIQUE simples.
 */
@Entity('pedidos')
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'numero_pedido'], { unique: true, where: 'numero_pedido IS NOT NULL' })
@Index(['tenant_id', 'updated_at'])
@Index(['tenant_id', 'status'])
@Index(['tenant_id', 'data'])
export class Order extends VersionedBaseEntity {
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
  @JoinColumn({ name: 'cliente_id' })
  cliente: Client | null;

  @Column({ name: 'vendedor_id', type: 'int', nullable: true })
  vendedor_id: number | null;

  @Column({ name: 'fornecedor_id', type: 'int', nullable: true })
  fornecedor_id: number | null;

  @ManyToOne(() => Supplier, { nullable: true })
  @JoinColumn({ name: 'fornecedor_id' })
  fornecedor: Supplier | null;

  @Column({ name: 'transportadora_id', type: 'int', nullable: true })
  transportadora_id: number | null;

  @ManyToOne(() => Transport, { nullable: true })
  @JoinColumn({ name: 'transportadora_id' })
  transportadora: Transport | null;

  @Column({ name: 'data', type: 'date', nullable: true })
  data: string | null;

  /** 'em_aberto' | 'concluido' | 'cancelado' */
  @Column({ name: 'status', type: 'varchar', default: 'em_aberto' })
  status: string;

  @Column({ name: 'total_sem_imposto', type: 'decimal', precision: 10, scale: 2, nullable: true })
  total_sem_imposto: number | null;

  @Column({ name: 'total_com_imposto', type: 'decimal', precision: 10, scale: 2, nullable: true })
  total_com_imposto: number | null;

  @Column({ name: 'pgt', type: 'varchar', nullable: true })
  pgt: string | null;

  @Column({ name: 'prazo', type: 'varchar', nullable: true })
  prazo: string | null;

  @Column({ name: 'local_entrega', type: 'varchar', nullable: true })
  local_entrega: string | null;

  @Column({ name: 'observacao', type: 'text', nullable: true })
  observacao: string | null;

  @OneToMany(() => OrderItem, (item) => item.pedido, { cascade: true })
  itens: OrderItem[];
}
