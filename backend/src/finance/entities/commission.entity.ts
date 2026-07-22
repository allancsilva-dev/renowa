import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { VersionedBaseEntity } from '../../common/entities/versioned-base.entity';
import { Client } from '../../clients/entities/client.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';
import { Order } from '../../orders/entities/order.entity';
import { NotaFiscal } from '../../faturamento/entities/nota-fiscal.entity';

/**
 * valor_comissao: snapshot imutável calculado no lançamento.
 * NUNCA recalculado retroativamente.
 */
@Entity('comissoes')
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'updated_at'])
@Index(['tenant_id', 'deleted_at'])
@Index(['tenant_id', 'data_pedido'])
@Index(['tenant_id', 'status'])
@Index(['tenant_id', 'fornecedor_id'])
export class Commission extends VersionedBaseEntity {
  // Relacionamentos opcionais
  @Column({ name: 'cliente_id', type: 'int', nullable: true })
  cliente_id: number | null;

  @ManyToOne(() => Client, { nullable: true })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenant_id' },
    { name: 'cliente_id', referencedColumnName: 'id' },
  ])
  cliente: Client | null;

  @Column({ name: 'fornecedor_id', type: 'int', nullable: true })
  fornecedor_id: number | null;

  @ManyToOne(() => Supplier, { nullable: true })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenant_id' },
    { name: 'fornecedor_id', referencedColumnName: 'id' },
  ])
  fornecedor: Supplier | null;

  // Dados do pedido/NF
  @Column({ name: 'numero_pedido', type: 'varchar', nullable: true })
  numero_pedido: string | null;

  @Column({ name: 'numero_nfe', type: 'varchar', nullable: true })
  numero_nfe: string | null;

  /** Vínculo com o pedido de origem (comissão nascida do faturamento). Nullable — comissões legadas não têm. */
  @Column({ name: 'pedido_id', type: 'int', nullable: true })
  pedido_id: number | null;

  @ManyToOne(() => Order, { nullable: true })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenant_id' },
    { name: 'pedido_id', referencedColumnName: 'id' },
  ])
  pedido: Order | null;

  /** Vínculo 1:1 com a nota fiscal que originou esta comissão. Nullable — comissões legadas não têm. */
  @Column({ name: 'nota_fiscal_id', type: 'int', nullable: true })
  nota_fiscal_id: number | null;

  @ManyToOne(() => NotaFiscal, { nullable: true })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenant_id' },
    { name: 'nota_fiscal_id', referencedColumnName: 'id' },
  ])
  notaFiscal: NotaFiscal | null;

  // Datas
  @Column({ name: 'data_pedido', type: 'date', nullable: true })
  data_pedido: string | null;

  @Column({ name: 'data_faturamento', type: 'date', nullable: true })
  data_faturamento: string | null;

  /** Data em que a comissão foi efetivamente paga — só entra no caixa quando preenchida e status='pago'. */
  @Column({ name: 'data_pagamento', type: 'date', nullable: true })
  data_pagamento: string | null;

  // Valores
  @Column({ name: 'valor_pedido', type: 'decimal', precision: 12, scale: 2, nullable: true })
  valor_pedido: string | null;

  @Column({ name: 'valor_faturado', type: 'decimal', precision: 12, scale: 2, nullable: true })
  valor_faturado: string | null;

  @Column({ name: 'perc_comissao', type: 'decimal', precision: 5, scale: 2, nullable: true })
  perc_comissao: string | null;

  /** Snapshot imutável — calculado no lançamento */
  @Column({ name: 'valor_comissao', type: 'decimal', precision: 12, scale: 2, default: 0 })
  valor_comissao: string;

  /** 'pendente' | 'faturado' | 'pago' */
  @Column({ name: 'status', type: 'varchar', default: 'pendente' })
  status: string;
}
