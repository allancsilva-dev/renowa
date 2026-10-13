import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { VersionedBaseEntity } from '../../common/entities/versioned-base.entity';
import { Preposto } from './preposto.entity';
import { Order } from '../../orders/entities/order.entity';

/**
 * Venda do preposto (0051): uma por nota fiscal ativa de pedido com preposto.
 * `perc_comissao` é snapshot (o cadastro pode mudar depois); `valor_comissao`
 * incide sobre `valor_faturado`, o valor da nota. CHECK garante pago ⇔
 * `movimento_id` + `data_pagamento`.
 */
@Entity('preposto_comissoes')
@Index(['tenant_id', 'id'], { unique: true })
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'updated_at'])
export class PrepostoComissao extends VersionedBaseEntity {
  @Column({ name: 'preposto_id', type: 'int' })
  preposto_id: number;

  @ManyToOne(() => Preposto)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenant_id' },
    { name: 'preposto_id', referencedColumnName: 'id' },
  ])
  preposto: Preposto;

  @Column({ name: 'pedido_id', type: 'int' })
  pedido_id: number;

  @ManyToOne(() => Order)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenant_id' },
    { name: 'pedido_id', referencedColumnName: 'id' },
  ])
  pedido: Order;

  @Column({ name: 'nota_fiscal_id', type: 'int' })
  nota_fiscal_id: number;

  @Column({ name: 'numero_nfe', type: 'varchar', length: 60, nullable: true })
  numero_nfe: string | null;

  @Column({ name: 'data_faturamento', type: 'date', nullable: true })
  data_faturamento: string | null;

  @Column({ name: 'valor_faturado', type: 'decimal', precision: 18, scale: 2 })
  valor_faturado: string;

  @Column({ name: 'perc_comissao', type: 'decimal', precision: 5, scale: 2 })
  perc_comissao: string;

  @Column({ name: 'valor_comissao', type: 'decimal', precision: 18, scale: 2 })
  valor_comissao: string;

  /** 'pendente' | 'pago' */
  @Column({ name: 'status', type: 'varchar', length: 20, default: 'pendente' })
  status: string;

  @Column({ name: 'data_pagamento', type: 'date', nullable: true })
  data_pagamento: string | null;

  /** Saída no Financeiro criada ao pagar. */
  @Column({ name: 'movimento_id', type: 'int', nullable: true })
  movimento_id: number | null;
}
