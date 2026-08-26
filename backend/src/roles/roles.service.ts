import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TenantRole } from '../rbac/entities/tenant-role.entity';
import { TenantRolePermission } from '../rbac/entities/tenant-role-permission.entity';
import { LocalUser } from '../rbac/entities/local-user.entity';
import { Permission } from '../common/entities/permission.entity';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AuditService } from '../audit/audit.service';
import { RequestUser } from '../common/types/jwt-payload.type';

const AUDIT_PURPOSE = 'Gestão de perfis de acesso do tenant';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(TenantRole)
    private readonly tenantRoleRepo: Repository<TenantRole>,
    @InjectRepository(TenantRolePermission)
    private readonly tenantRolePermissionRepo: Repository<TenantRolePermission>,
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
    private readonly audit: AuditService,
  ) {}

  private normalizeName(name: string): string {
    return name.trim().toLowerCase();
  }

  private async findTenantRoleOrFail(
    tenantId: string,
    roleUuid: string,
  ): Promise<TenantRole> {
    const role = await this.tenantRoleRepo.findOne({
      where: { tenantId, uuid: roleUuid, active: true },
    });

    if (!role) {
      throw new NotFoundException('Role não encontrada no tenant');
    }

    return role;
  }

  private async listRolePermissionSlugs(tenantId: string, roleId: number): Promise<string[]> {
    const links = await this.tenantRolePermissionRepo.find({
      where: { tenantId, roleId },
      relations: ['permission'],
    });

    return Array.from(new Set(links.map((link) => link.permission.slug))).sort();
  }

  private async assertPermissionsExist(slugs: string[]): Promise<void> {
    const permissions = await this.permissionRepo.find({ where: { slug: In(slugs) } });
    const found = new Set(permissions.map((perm) => perm.slug));
    const invalid = slugs.filter((slug) => !found.has(slug));
    if (invalid.length > 0) {
      throw new BadRequestException(`Permissões inválidas: ${invalid.join(', ')}`);
    }
  }

  async listRoles(tenantId: string): Promise<Array<{
    id: string;
    name: string;
    description: string | null;
    active: boolean;
    isSystem: boolean;
    permissions: string[];
  }>> {
    const roles = await this.tenantRoleRepo.find({
      where: { tenantId, active: true },
      order: { name: 'ASC' },
    });

    const mapped = await Promise.all(
      roles.map(async (role) => ({
        id: role.uuid,
        name: role.name,
        description: role.description,
        active: role.active,
        isSystem: role.isSystem,
        permissions: await this.listRolePermissionSlugs(tenantId, role.id),
      })),
    );

    return mapped;
  }

  /**
   * Criação atômica: role + permissões iniciais na mesma transação, pra
   * telas de criação não precisarem de um segundo request (e um segundo
   * ponto de falha) só pra atribuir as permissões escolhidas no modal.
   */
  async createRole(
    tenantId: string,
    dto: CreateRoleDto,
    actor?: RequestUser,
  ): Promise<{
    id: string;
    name: string;
    description: string | null;
    active: boolean;
    isSystem: boolean;
    permissions: string[];
  }> {
    const name = this.normalizeName(dto.name);
    const normalizedPermissions = Array.from(new Set((dto.permissions ?? []).map((slug) => slug.trim())));

    const existing = await this.tenantRoleRepo.findOne({
      where: { tenantId, name },
    });

    if (existing?.active) {
      throw new BadRequestException('Já existe uma role com este nome no tenant');
    }

    if (normalizedPermissions.length > 0) {
      await this.assertPermissionsExist(normalizedPermissions);
    }

    const roleId = await this.tenantRoleRepo.manager.transaction(async (manager) => {
      const roleRepo = manager.getRepository(TenantRole);
      const role = existing ?? roleRepo.create({ tenantId, name, active: true });
      role.description = dto.description ?? null;
      role.active = true;
      const saved = await roleRepo.save(role);

      if (normalizedPermissions.length > 0) {
        const permissionRepo = manager.getRepository(TenantRolePermission);
        await permissionRepo.insert(
          normalizedPermissions.map((slug) => permissionRepo.create({ tenantId, roleId: saved.id, permissionSlug: slug })),
        );
      }

      return saved.id;
    });

    const saved = await this.tenantRoleRepo.findOneOrFail({ where: { tenantId, id: roleId } });

    if (actor) {
      await this.audit.record({
        tenantId, actor, action: 'CREATE', resourceType: 'tenant_role', resourceUuid: saved.uuid,
        fields: ['name', 'description', 'permissions'], purpose: AUDIT_PURPOSE,
        metadata: { permissionCount: normalizedPermissions.length },
      });
    }

    return {
      id: saved.uuid,
      name: saved.name,
      description: saved.description,
      active: saved.active,
      isSystem: saved.isSystem,
      permissions: await this.listRolePermissionSlugs(tenantId, saved.id),
    };
  }

  async updateRole(
    tenantId: string,
    roleUuid: string,
    dto: UpdateRoleDto,
    actor?: RequestUser,
  ): Promise<{
    id: string;
    name: string;
    description: string | null;
    active: boolean;
    isSystem: boolean;
    permissions: string[];
  }> {
    const role = await this.findTenantRoleOrFail(tenantId, roleUuid);
    let renamed = false;

    if (dto.name) {
      const nextName = this.normalizeName(dto.name);

      if (nextName !== role.name) {
        if (role.isSystem) {
          throw new ForbiddenException('Role de sistema não pode ser renomeada');
        }

        const conflict = await this.tenantRoleRepo.findOne({
          where: { tenantId, name: nextName, active: true },
        });

        if (conflict && conflict.uuid !== roleUuid) {
          throw new BadRequestException('Já existe uma role com este nome no tenant');
        }

        role.name = nextName;
        renamed = true;
      }
    }

    if (dto.description !== undefined) {
      role.description = dto.description;
    }

    const saved = await this.tenantRoleRepo.manager.transaction(async (manager) => {
      const persisted = await manager.getRepository(TenantRole).save(role);

      // `usuarios.roles` (jsonb, por nome) é a cópia que vai para o JWT; a
      // associação de verdade é `local_users.role_id`. Renomear sem propagar
      // deixava o token carregando um nome de perfil que não existe mais.
      // O bump de `access_token_version` segue o mesmo padrão da troca de
      // perfil em `users.service.ts`.
      if (renamed) {
        await manager.query(
          `UPDATE usuarios
              SET roles = to_jsonb(ARRAY[$3::text]),
                  access_token_version = access_token_version + 1
            WHERE tenant_id = $1
              AND uuid IN (
                SELECT auth_user_id FROM local_users
                 WHERE tenant_id = $1 AND role_id = $2 AND deleted_at IS NULL
              )`,
          [tenantId, persisted.id, persisted.name],
        );
      }

      return persisted;
    });

    if (actor) {
      await this.audit.record({
        tenantId, actor, action: 'UPDATE', resourceType: 'tenant_role', resourceUuid: saved.uuid,
        fields: ['name', 'description'], purpose: AUDIT_PURPOSE,
      });
    }

    return {
      id: saved.uuid,
      name: saved.name,
      description: saved.description,
      active: saved.active,
      isSystem: saved.isSystem,
      permissions: await this.listRolePermissionSlugs(tenantId, saved.id),
    };
  }

  /**
   * Exclui um perfil — fail-closed em duas frentes.
   *
   * Antes, isto era cosmético do ponto de vista de autorização: só marcava
   * `active = false` + soft-delete, deixando `local_users.role_id` apontando
   * para a role morta e as linhas de `tenant_role_permissions` intactas (o
   * `ON DELETE CASCADE` da FK só dispara em delete físico). Quem estava no
   * perfil seguia autorizado para sempre.
   *
   * Agora: perfil em uso é recusado com 409 — mover os usuários é decisão de
   * quem administra, não efeito colateral de um clique — e, quando ninguém
   * está vinculado, os vínculos de permissão são apagados junto, na mesma
   * transação. O filtro de role viva em `PermissionsService` é a segunda
   * camada, para perfis já excluídos antes desta correção.
   */
  async deleteRole(tenantId: string, roleUuid: string, actor?: RequestUser): Promise<void> {
    const role = await this.findTenantRoleOrFail(tenantId, roleUuid);

    if (role.isSystem) {
      throw new ForbiddenException('Role de sistema não pode ser excluída');
    }

    const revokedCount = await this.tenantRoleRepo.manager.transaction(async (manager) => {
      const inUse = await manager.getRepository(LocalUser).count({
        where: { tenantId, roleId: role.id, active: true },
      });

      if (inUse > 0) {
        throw new ConflictException(
          `Perfil em uso por ${inUse} usuário(s). Mova-os para outro perfil antes de excluir.`,
        );
      }

      const permissionRepo = manager.getRepository(TenantRolePermission);
      const revoked = await permissionRepo.count({ where: { tenantId, roleId: role.id } });
      await permissionRepo.delete({ tenantId, roleId: role.id });

      const roleRepo = manager.getRepository(TenantRole);
      role.active = false;
      await roleRepo.save(role);
      await roleRepo.softDelete({ id: role.id });

      return revoked;
    });

    if (actor) {
      await this.audit.record({
        tenantId, actor, action: 'DELETE', resourceType: 'tenant_role', resourceUuid: role.uuid,
        fields: ['active', 'permissions'], purpose: AUDIT_PURPOSE,
        metadata: { revokedPermissionCount: revokedCount },
      });
    }
  }

  async updateRolePermissions(
    tenantId: string,
    roleUuid: string,
    permissionSlugs: string[],
    actor?: RequestUser,
  ): Promise<{
    id: string;
    name: string;
    description: string | null;
    active: boolean;
    isSystem: boolean;
    permissions: string[];
  }> {
    const role = await this.findTenantRoleOrFail(tenantId, roleUuid);

    if (role.isSystem) {
      throw new ForbiddenException('Permissões de uma role de sistema não podem ser editadas');
    }

    const normalized = Array.from(new Set(permissionSlugs.map((slug) => slug.trim())));

    if (normalized.length > 0) {
      await this.assertPermissionsExist(normalized);
    }

    await this.tenantRolePermissionRepo.manager.transaction(async (manager) => {
      await manager.getRepository(TenantRolePermission).delete({ tenantId, roleId: role.id });

      if (normalized.length === 0) return;

      const toInsert = normalized.map((permissionSlug) =>
        manager.getRepository(TenantRolePermission).create({
          tenantId,
          roleId: role.id,
          permissionSlug,
        }),
      );

      await manager.getRepository(TenantRolePermission).save(toInsert);
    });

    if (actor) {
      await this.audit.record({
        tenantId, actor, action: 'UPDATE', resourceType: 'tenant_role', resourceUuid: role.uuid,
        fields: ['permissions'], purpose: AUDIT_PURPOSE,
        metadata: { permissionCount: normalized.length },
      });
    }

    return {
      id: role.uuid,
      name: role.name,
      description: role.description,
      active: role.active,
      isSystem: role.isSystem,
      permissions: await this.listRolePermissionSlugs(tenantId, role.id),
    };
  }
}
