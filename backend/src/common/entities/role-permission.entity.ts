import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Permission } from './permission.entity';

@Entity('role_permissions')
@Index(['role', 'permissionSlug'], { unique: true })
export class RolePermission {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  role: string;

  @Column({ name: 'permission_slug', type: 'varchar', length: 100 })
  permissionSlug: string;

  @ManyToOne(() => Permission, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permission_slug', referencedColumnName: 'slug' })
  permission: Permission;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date;
}
