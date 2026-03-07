import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * Controla sessões mobile — permite revogar tokens HS256 via token_version.
 * CHANGELOG #11: tenant_id obrigatório (herdado de BaseEntity)
 */
@Entity('mobile_sessions')
@Index(['tenant_id', 'user_uuid'])
export class MobileSession extends BaseEntity {
  @Column({ name: 'user_uuid', type: 'uuid' })
  user_uuid: string;

  /** Versão do token — incrementar para revogar todas as sessões do usuário. */
  @Column({ name: 'token_version', type: 'int', default: 1 })
  token_version: number;

  @Column({ name: 'device_info', type: 'varchar', length: 255, nullable: true })
  device_info: string | null;

  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  last_seen_at: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expires_at: Date;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  is_active: boolean;
}
