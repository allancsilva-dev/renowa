import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Order } from '../../orders/entities/order.entity';
import { Client } from '../../clients/entities/client.entity';

export enum MovimentacaoTipo {
  RECEITA = 'RECEITA',
  DESPESA = 'DESPESA',
}

export enum MovimentacaoStatus {
  PENDENTE = 'PENDENTE',
  PAGO = 'PAGO',
  CANCELADO = 'CANCELADO',
  ATRASADO = 'ATRASADO',
}

@Entity('financeiro_movimentacao')
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'updated_at'])
@Index(['tenant_id', 'data_vencimento'])
@Index(['tenant_id', 'status'])
export class FinanceMovement extends BaseEntity {
  @Column({ name: 'tipo', type: 'enum', enum: MovimentacaoTipo })
  tipo: MovimentacaoTipo;

  @Column({ name: 'status', type: 'enum', enum: MovimentacaoStatus, default: MovimentacaoStatus.PENDENTE })
  status: MovimentacaoStatus;

  @Column({ name: 'descricao', type: 'varchar', length: 500 })
  descricao: string;

  @Column({ name: 'valor', type: 'decimal', precision: 15, scale: 2 })
  valor: number;

  @Column({ name: 'data_vencimento', type: 'date' })
  data_vencimento: string;

  @Column({ name: 'data_pagamento', type: 'date', nullable: true })
  data_pagamento: string | null;

  @Column({ name: 'pedido_id', type: 'int', nullable: true })
  pedido_id: number | null;

  @ManyToOne(() => Order, { nullable: true })
  @JoinColumn({ name: 'pedido_id' })
  pedido: Order | null;

  @Column({ name: 'cliente_id', type: 'int', nullable: true })
  cliente_id: number | null;

  @ManyToOne(() => Client, { nullable: true })
  @JoinColumn({ name: 'cliente_id' })
  cliente: Client | null;

  @Column({ name: 'observacoes', type: 'text', nullable: true })
  observacoes: string | null;
}
