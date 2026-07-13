import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from '../common/entities/permission.entity';
import { TenantRolePermission } from '../rbac/entities/tenant-role-permission.entity';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
    @InjectRepository(TenantRolePermission)
    private readonly tenantRolePermissionRepo: Repository<TenantRolePermission>,
  ) {}

  async listAll(): Promise<Array<{
    slug: string;
    module: string;
    description: string | null;
  }>> {
    const permissions = await this.permissionRepo.find({
      order: { module: 'ASC', slug: 'ASC' },
    });

    return permissions.map((permission) => ({
      slug: permission.slug,
      module: permission.module,
      description: permission.description,
    }));
  }

  async listEffectiveForRole(tenantId: string, roleId: number): Promise<string[]> {
    const rows = await this.tenantRolePermissionRepo.find({
      where: { tenantId, roleId },
      select: { permissionSlug: true },
      order: { permissionSlug: 'ASC' },
    });

    return Array.from(new Set(rows.map((row) => row.permissionSlug)));
  }

  async listAllSlugs(): Promise<string[]> {
    const rows = await this.permissionRepo.find({
      select: { slug: true },
      order: { slug: 'ASC' },
    });
    return rows.map((row) => row.slug);
  }
}
