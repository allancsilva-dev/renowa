import { Column, Entity, Index, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Client } from '../../clients/entities/client.entity';
import { Transport } from '../../transport/entities/transport.entity';
import { OrderItem } from './order-item.entity';

export enum OrderStatus {
  RASCUNHO = 'RASCUNHO',
  ENVIADO = 'ENVIADO',
  CONFIRMADO = 'CONFIRMADO',
  FATURADO = 'FATURADO',
  CANCELADO = 'CANCELADO',
}

/**
 * CHANGELOG #9: UNIQUE(tenant_id, numero_pedido)
 * CHANGELOG #14: numero_pedido é sequence global (tradeoff documentado: simplicidade vs sequence por tenant)
 */
@Entity('pedidos')
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'numero_pedido'], { unique: true })  // CHANGELOG #9
@Index(['tenant_id', 'updated_at'])
@Index(['tenant_id', 'cliente_id'])
export class Order extends BaseEntity {
  // CHANGELOG #14: sequence global — decisão consciente por simplicidade
  @Column({ name: 'numero_pedido', type: 'int', generated: 'increment' })
  numero_pedido: number;

  @Column({ name: 'cliente_id', type: 'int' })
  cliente_id: number;

  @ManyToOne(() => Client)
  @JoinColumn({ name: 'cliente_id' })
  cliente: Client;

  @Column({ name: 'transportadora_id', type: 'int', nullable: true })
  transportadora_id: number | null;

  @ManyToOne(() => Transport, { nullable: true })
  @JoinColumn({ name: 'transportadora_id' })
  transportadora: Transport | null;

  @Column({ name: 'status', type: 'enum', enum: OrderStatus, default: OrderStatus.RASCUNHO })
  status: OrderStatus;

  @Column({ name: 'data_pedido', type: 'date' })
  data_pedido: string;

  @Column({ name: 'data_entrega_prevista', type: 'date', nullable: true })
  data_entrega_prevista: string | null;

  @Column({ name: 'valor_total', type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_total: number;

  @Column({ name: 'desconto_total', type: 'decimal', precision: 15, scale: 2, default: 0 })
  desconto_total: number;

  @Column({ name: 'observacoes', type: 'text', nullable: true })
  observacoes: string | null;

  @Column({ name: 'representante_uuid', type: 'uuid', nullable: true })
  representante_uuid: string | null;

  @OneToMany(() => OrderItem, (item) => item.pedido, { cascade: true })
  itens: OrderItem[];
}
