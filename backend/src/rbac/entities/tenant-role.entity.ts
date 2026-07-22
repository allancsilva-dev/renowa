import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Generated,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TenantRolePermission } from './tenant-role-permission.entity';

@Entity('tenant_roles')
@Unique(['tenantId', 'id'])
@Index('UQ_tenant_roles_tenant_id_name_active', ['tenantId', 'name'], { unique: true, where: 'deleted_at IS NULL' })
@Index(['tenantId'])
@Index(['tenantId', 'active'])
export class TenantRole {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ type: 'uuid' })
  @Generated('uuid')
  uuid!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP', insert: false, update: false })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @OneToMany(() => TenantRolePermission, (trp) => trp.role)
  rolePermissions!: TenantRolePermission[];
}
