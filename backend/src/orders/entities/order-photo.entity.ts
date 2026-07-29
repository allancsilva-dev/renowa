import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { VersionedBaseEntity } from '../../common/entities/versioned-base.entity';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';

/**
 * Foto anexada ao pedido. Fica no papel impresso; quando o nome do arquivo
 * bate com o código de um item, o vínculo com esse item é automático.
 *
 * Storage em `bytea` no próprio Postgres (ver migration 0034 para o porquê).
 * `storage_backend`/`storage_key` existem para permitir migrar a bucket depois
 * sem migrar o dado já gravado.
 */
@Entity('pedido_fotos')
@Index(['tenant_id', 'id'], { unique: true })
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'pedido_id'])
@Index(['tenant_id', 'updated_at'])
@Index(['tenant_id', 'deleted_at'])
export class OrderPhoto extends VersionedBaseEntity {
  @Column({ name: 'pedido_id', type: 'int' })
  pedido_id: number;

  @ManyToOne(() => Order)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenant_id' },
    { name: 'pedido_id', referencedColumnName: 'id' },
  ])
  pedido: Order;

  /** NULL = foto do pedido inteiro (nome do arquivo não bateu com nenhum item). */
  @Column({ name: 'item_pedido_id', type: 'int', nullable: true })
  item_pedido_id: number | null;

  @ManyToOne(() => OrderItem, { nullable: true })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenant_id' },
    { name: 'item_pedido_id', referencedColumnName: 'id' },
  ])
  item: OrderItem | null;

  @Column({ name: 'nome_arquivo', type: 'varchar' })
  nome_arquivo: string;

  /** Código derivado do nome do arquivo — auditoria do auto-vínculo. */
  @Column({ name: 'codigo_vinculo', type: 'varchar', nullable: true })
  codigo_vinculo: string | null;

  /** CHECK no banco limita a image/jpeg, image/png e image/webp. */
  @Column({ name: 'mime_type', type: 'varchar' })
  mime_type: string;

  @Column({ name: 'tamanho_bytes', type: 'int' })
  tamanho_bytes: number;

  @Column({ name: 'storage_backend', type: 'varchar', default: 'db' })
  storage_backend: string;

  /**
   * `select: false`: os bytes só saem do banco no endpoint de conteúdo. Sem
   * isto, listar as fotos de um pedido traria todos os binários junto.
   */
  @Column({ name: 'conteudo', type: 'bytea', nullable: true, select: false })
  conteudo: Buffer | null;

  @Column({ name: 'storage_key', type: 'varchar', nullable: true })
  storage_key: string | null;
}
