import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { VersionedBaseEntity } from '../../common/entities/versioned-base.entity';
import { Product } from './product.entity';

/**
 * Foto do produto no catálogo. Vai na linha do item no papel do pedido, em todo
 * pedido que use o produto.
 *
 * UMA por produto — índice único parcial `uq_produto_fotos_produto` (0040)
 * garante no banco. Trocar a foto é soft-deletar a atual e inserir outra.
 *
 * Storage em `bytea` no próprio Postgres (ver migration 0040 para o porquê, e
 * para o motivo de ser tabela separada em vez de coluna em `produtos`).
 *
 * Sem vínculo com titular, de propósito: a foto é do catálogo, compartilhada por
 * todos os pedidos que usam o produto, e nenhuma solicitação LGPD tem por onde
 * alcançá-la. A coluna `origem_pedido_id` que existia para isso saiu na 0042 —
 * ver `TABELAS_SEM_PII` em `privacy/pii-registry.ts`.
 */
@Entity('produto_fotos')
@Index(['tenant_id', 'id'], { unique: true })
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'updated_at'])
@Index(['tenant_id', 'deleted_at'])
export class ProductPhoto extends VersionedBaseEntity {
  @Column({ name: 'produto_id', type: 'int' })
  produto_id: number;

  @ManyToOne(() => Product)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenant_id' },
    { name: 'produto_id', referencedColumnName: 'id' },
  ])
  produto: Product;

  @Column({ name: 'nome_arquivo', type: 'varchar' })
  nome_arquivo: string;

  /** CHECK no banco limita a image/jpeg, image/png e image/webp. */
  @Column({ name: 'mime_type', type: 'varchar' })
  mime_type: string;

  @Column({ name: 'tamanho_bytes', type: 'int' })
  tamanho_bytes: number;

  @Column({ name: 'storage_backend', type: 'varchar', default: 'db' })
  storage_backend: string;

  /**
   * `select: false`: os bytes só saem do banco no endpoint de conteúdo. Sem
   * isto, qualquer consulta ao produto traria o binário junto.
   */
  @Column({ name: 'conteudo', type: 'bytea', nullable: true, select: false })
  conteudo: Buffer | null;

  @Column({ name: 'storage_key', type: 'varchar', nullable: true })
  storage_key: string | null;
}
