import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from '../common/entities/permission.entity';
import { TenantRole } from '../rbac/entities/tenant-role.entity';
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

  /**
   * Permissões efetivas de um perfil — ponto de estrangulamento único do RBAC:
   * atende o `PermissionGuard` e o `GET /auth/me`.
   *
   * O `innerJoin` com `tenant_roles` não é decoração. Excluir um perfil é
   * soft-delete (`roles.service.ts#deleteRole`), então o `ON DELETE CASCADE`
   * de `tenant_role_permissions` nunca dispara e as linhas de permissão
   * sobrevivem à exclusão. Sem o filtro de `active`/`deleted_at`, um usuário
   * vinculado a perfil excluído continuava passando por todo guard,
   * indefinidamente. Perfil morto agora resolve para zero slugs.
   */
  async listEffectiveForRole(tenantId: string, roleId: number): Promise<string[]> {
    const rows = await this.tenantRolePermissionRepo
      .createQueryBuilder('trp')
      .select('trp.permission_slug', 'slug')
      .innerJoin(
        TenantRole,
        'role',
        'role.id = trp.role_id AND role.tenant_id = trp.tenant_id',
      )
      .where('trp.tenant_id = :tenantId', { tenantId })
      .andWhere('trp.role_id = :roleId', { roleId })
      .andWhere('role.active = true')
      .andWhere('role.deleted_at IS NULL')
      .orderBy('trp.permission_slug', 'ASC')
      .getRawMany<{ slug: string }>();

    return Array.from(new Set(rows.map((row) => row.slug)));
  }

  async listAllSlugs(): Promise<string[]> {
    const rows = await this.permissionRepo.find({
      select: { slug: true },
      order: { slug: 'ASC' },
    });
    return rows.map((row) => row.slug);
  }
}
