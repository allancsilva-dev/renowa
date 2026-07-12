import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * Store de identidade e credenciais do Renowa (auth nativa).
 *
 * Auth nativa (FASE 1): senha_hash REINTRODUZIDO — usuarios é o store de credenciais
 *   (argon2id). Substitui a auth federada ZonaDevAuth. Email é global único.
 * CHANGELOG #2: UNIQUE(tenant_id, uuid) — mesmo usuário pode existir em dois tenants.
 * CHANGELOG #7: roles é string[].
 */
@Entity('usuarios')
@Index(['tenant_id', 'uuid'], { unique: true })   // CHANGELOG #2
@Index(['email'], { unique: true })               // Auth nativa: email global único
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

  // Auth nativa: store de credenciais (argon2id). null enquanto usuário não define senha.
  @Column({ name: 'senha_hash', type: 'text', nullable: true })
  senha_hash: string | null;

  @Column({ name: 'failed_login_attempts', type: 'int', default: 0 })
  failed_login_attempts: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  locked_until: Date | null;
}
