import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Generated,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TenantRole } from './tenant-role.entity';

@Entity('local_users')
@Unique(['authUserId', 'tenantId'])
@Index(['tenantId'])
@Index(['tenantId', 'active'])
@Index(['tenantId', 'roleId'])
export class LocalUser {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'uuid' })
  @Generated('uuid')
  uuid: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'auth_user_id', type: 'uuid' })
  authUserId: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ name: 'role_id', type: 'int' })
  roleId: number;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP', insert: false, update: false })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @ManyToOne(() => TenantRole)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'role_id', referencedColumnName: 'id' },
  ])
  role: TenantRole;
}
