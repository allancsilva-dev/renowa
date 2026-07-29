import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { VersionedBaseEntity } from '../../common/entities/versioned-base.entity';
import { SacTicket } from './sac-ticket.entity';
import { Product } from '../../products/entities/product.entity';

/** Linha do chamado: COD · QUANT · MOTIVO · VL UNI. (NF) · VL. TOTAL NF. */
@Entity('itens_chamado_sac')
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'chamado_id'])
@Index(['tenant_id', 'updated_at'])
@Index(['tenant_id', 'deleted_at'])
export class SacTicketItem extends VersionedBaseEntity {
  @Column({ name: 'chamado_id', type: 'int' })
  chamado_id: number;

  @ManyToOne(() => SacTicket, (chamado) => chamado.itens)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenant_id' },
    { name: 'chamado_id', referencedColumnName: 'id' },
  ])
  chamado: SacTicket;

  /** Vínculo opcional — o SAC também trata item que nunca foi cadastrado. */
  @Column({ name: 'produto_id', type: 'int', nullable: true })
  produto_id: number | null;

  @ManyToOne(() => Product, { nullable: true })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenant_id' },
    { name: 'produto_id', referencedColumnName: 'id' },
  ])
  produto: Product | null;

  @Column({ name: 'codigo', type: 'varchar' })
  codigo: string;

  @Column({ name: 'quantidade', type: 'decimal', precision: 18, scale: 3 })
  quantidade: string;

  @Column({ name: 'motivo', type: 'varchar' })
  motivo: string;

  @Column({ name: 'valor_unitario', type: 'decimal', precision: 18, scale: 2 })
  valor_unitario: string;

  /** quantidade × valor_unitario — derivado pelo servidor. */
  @Column({ name: 'valor_total', type: 'decimal', precision: 18, scale: 2 })
  valor_total: string;
}
