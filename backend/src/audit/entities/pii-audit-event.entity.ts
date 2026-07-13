import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type PiiAuditAction = 'READ' | 'CREATE' | 'UPDATE' | 'DELETE' | 'EXPORT' | 'AUDIT_READ';

@Entity('pii_audit_events')
@Index(['tenant_id', 'occurred_at'])
export class PiiAuditEvent {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ type: 'uuid', generated: 'uuid', unique: true }) event_uuid: string;
  @Column({ type: 'uuid' }) tenant_id: string;
  @Column({ type: 'uuid' }) actor_id: string;
  @Column({ type: 'text', array: true, default: '{}' }) actor_roles: string[];
  @Column({ type: 'varchar', length: 32 }) action: PiiAuditAction;
  @Column({ type: 'varchar', length: 64 }) resource_type: string;
  @Column({ type: 'uuid', nullable: true }) resource_uuid: string | null;
  @Column({ type: 'text', array: true, default: '{}' }) fields: string[];
  @Column({ type: 'varchar', length: 120 }) purpose: string;
  @Column({ type: 'uuid', nullable: true }) correlation_id: string | null;
  @Column({ type: 'jsonb', default: {} }) metadata: Record<string, string | number | boolean>;
  @CreateDateColumn({ type: 'timestamptz', name: 'occurred_at' }) occurred_at: Date;
}
