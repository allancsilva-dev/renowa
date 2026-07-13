import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Permission } from '../../common/entities/permission.entity';
import { TenantRole } from './tenant-role.entity';

@Entity('tenant_role_permissions')
@Unique(['tenantId', 'roleId', 'permissionSlug'])
@Index(['tenantId', 'roleId'])
@Index(['permissionSlug'])
export class TenantRolePermission {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'role_id', type: 'int' })
  roleId: number;

  @Column({ name: 'permission_slug', type: 'varchar', length: 100 })
  permissionSlug: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => TenantRole, (role) => role.rolePermissions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'role_id', referencedColumnName: 'id' },
  ])
  role: TenantRole;

  @ManyToOne(() => Permission, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permission_slug', referencedColumnName: 'slug' })
  permission: Permission;
}
