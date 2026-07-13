import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type LgpdRequestStatus = 'RECEIVED' | 'IDENTITY_VERIFIED' | 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED' | 'DENIED' | 'FAILED';
export type LgpdRequestType = 'ERASURE' | 'EXPORT';

@Entity('lgpd_requests')
@Index(['tenant_id', 'status', 'created_at'])
export class LgpdRequest {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ type: 'uuid', generated: 'uuid', unique: true }) request_uuid: string;
  @Column({ type: 'uuid' }) tenant_id: string;
  @Column({ type: 'varchar', length: 32 }) subject_type: 'CLIENT';
  @Column({ type: 'uuid' }) subject_uuid: string;
  @Column({ type: 'varchar', length: 32 }) request_type: LgpdRequestType;
  @Column({ type: 'varchar', length: 32, default: 'RECEIVED' }) status: LgpdRequestStatus;
  @Column({ type: 'uuid' }) requested_by: string;
  @Column({ type: 'uuid', nullable: true }) reviewed_by: string | null;
  @Column({ type: 'text', nullable: true }) reason: string | null;
  @Column({ type: 'text', nullable: true }) legal_basis: string | null;
  @Column({ type: 'text', nullable: true }) failure_reason: string | null;
  @Column({ type: 'jsonb', default: {} }) result: Record<string, unknown>;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP', insert: false, update: false }) updated_at: Date;
  @Column({ type: 'timestamptz', nullable: true }) completed_at: Date | null;
}
