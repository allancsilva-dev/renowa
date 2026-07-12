import { BaseEntity } from '../../common/entities/base.entity';
import { Column, Entity, Index } from 'typeorm';

/**
 * Refresh token rotativo (opaco, 64B). Guardado como hash SHA-256.
 * Rotação com detecção de reuso: reuso de token revogado revoga a família toda.
 */
@Entity('refresh_tokens')
@Index(['token_hash'])
@Index(['user_id'])
@Index(['family_id'])
export class RefreshToken extends BaseEntity {
  @Column({ name: 'token_hash', type: 'text' })
  token_hash: string;

  @Column({ name: 'user_id', type: 'bigint' })
  user_id: number;

  @Column({ name: 'family_id', type: 'uuid' })
  family_id: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expires_at: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revoked_at: Date | null;

  @Column({ name: 'replaced_by_id', type: 'bigint', nullable: true })
  replaced_by_id: number | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  user_agent: string | null;

  @Column({ name: 'ip', type: 'inet', nullable: true })
  ip: string | null;
}
