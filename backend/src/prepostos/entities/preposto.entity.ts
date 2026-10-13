import { Column, Entity, Index } from 'typeorm';
import { VersionedBaseEntity } from '../../common/entities/versioned-base.entity';

/**
 * Preposto: representante externo que vende em nome da empresa (0050). Não é
 * usuário — não loga, não é dono de pedido. Aparece no campo Vendedor do pedido
 * e recebe comissão sobre as notas dos pedidos dele (`preposto_comissoes`).
 */
@Entity('prepostos')
@Index(['tenant_id', 'id'], { unique: true })
@Index(['tenant_id', 'uuid'], { unique: true })
@Index(['tenant_id', 'updated_at'])
@Index(['tenant_id', 'deleted_at'])
export class Preposto extends VersionedBaseEntity {
  @Column({ name: 'nome', type: 'varchar', length: 200 })
  nome: string;

  /** CPF ou CNPJ, só dígitos. */
  @Column({ name: 'documento', type: 'varchar', length: 14, nullable: true })
  documento: string | null;

  @Column({ name: 'telefone', type: 'varchar', length: 30, nullable: true })
  telefone: string | null;

  @Column({ name: 'email', type: 'varchar', length: 200, nullable: true })
  email: string | null;

  @Column({ name: 'endereco_completo', type: 'text', nullable: true })
  endereco_completo: string | null;

  /** Percentual padrão sobre o valor da nota; cada venda guarda o seu snapshot. */
  @Column({ name: 'percentual_comissao', type: 'decimal', precision: 5, scale: 2, default: 0 })
  percentual_comissao: string;
}
