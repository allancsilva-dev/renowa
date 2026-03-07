import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * Espelho local do usuário do ZonaDevAuth.
 *
 * CHANGELOG #6: senha_hash REMOVIDO — auth exclusiva do ZonaDevAuth.
 * CHANGELOG #2: UNIQUE(tenant_id, uuid) — mesmo usuário pode existir em dois tenants.
 * CHANGELOG #7: roles é string[].
 */
@Entity('usuarios')
@Index(['tenant_id', 'uuid'], { unique: true })   // CHANGELOG #2
@Index(['tenant_id', 'email'])
export class User extends BaseEntity {
  @Column({ name: 'email', type: 'varchar', length: 255 })
  email: string;

  @Column({ name: 'nome', type: 'varchar', length: 255 })
  nome: string;

  // CHANGELOG #7: roles é string[] — guards sempre iteram o array
  @Column({ name: 'roles', type: 'jsonb', default: [] })
  roles: string[];

  @Column({ name: 'is_active', type: 'boolean', default: true })
  is_active: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  last_login_at: Date | null;
}
