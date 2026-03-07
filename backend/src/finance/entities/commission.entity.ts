import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Order } from '../../orders/entities/order.entity';

export enum CommissionStatus {
  PENDENTE = 'PENDENTE',
  APROVADA = 'APROVADA',
  PAGA = 'PAGA',
  CANCELADA = 'CANCELADA',
}

@Entity('comissoes')
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'updated_at'])
@Index(['tenant_id', 'representante_uuid'])
export class Commission extends BaseEntity {
  @Column({ name: 'representante_uuid', type: 'uuid' })
  representante_uuid: string;

  @Column({ name: 'pedido_id', type: 'int' })
  pedido_id: number;

  @ManyToOne(() => Order)
  @JoinColumn({ name: 'pedido_id' })
  pedido: Order;

  @Column({ name: 'percentual', type: 'decimal', precision: 5, scale: 2 })
  percentual: number;

  @Column({ name: 'valor_base', type: 'decimal', precision: 15, scale: 2 })
  valor_base: number;

  @Column({ name: 'valor_comissao', type: 'decimal', precision: 15, scale: 2 })
  valor_comissao: number;

  @Column({ name: 'status', type: 'enum', enum: CommissionStatus, default: CommissionStatus.PENDENTE })
  status: CommissionStatus;

  @Column({ name: 'data_pagamento', type: 'date', nullable: true })
  data_pagamento: string | null;
}
