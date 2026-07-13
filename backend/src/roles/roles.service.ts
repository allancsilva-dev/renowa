import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TenantRole } from '../rbac/entities/tenant-role.entity';
import { TenantRolePermission } from '../rbac/entities/tenant-role-permission.entity';
import { Permission } from '../common/entities/permission.entity';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(TenantRole)
    private readonly tenantRoleRepo: Repository<TenantRole>,
    @InjectRepository(TenantRolePermission)
    private readonly tenantRolePermissionRepo: Repository<TenantRolePermission>,
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
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

  async listRoles(tenantId: string): Promise<Array<{
    id: string;
    name: string;
    description: string | null;
    active: boolean;
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
        permissions: await this.listRolePermissionSlugs(tenantId, role.id),
      })),
    );

    return mapped;
  }

  async createRole(
    tenantId: string,
    dto: CreateRoleDto,
  ): Promise<{
    id: string;
    name: string;
    description: string | null;
    active: boolean;
    permissions: string[];
  }> {
    const name = this.normalizeName(dto.name);

    const existing = await this.tenantRoleRepo.findOne({
      where: { tenantId, name },
    });

    if (existing?.active) {
      throw new BadRequestException('Já existe uma role com este nome no tenant');
    }

    const role = existing ?? this.tenantRoleRepo.create({
      tenantId,
      name,
      description: dto.description ?? null,
      active: true,
    });

    role.description = dto.description ?? null;
    role.active = true;

    const saved = await this.tenantRoleRepo.save(role);

    return {
      id: saved.uuid,
      name: saved.name,
      description: saved.description,
      active: saved.active,
      permissions: await this.listRolePermissionSlugs(tenantId, saved.id),
    };
  }

  async updateRole(
    tenantId: string,
    roleUuid: string,
    dto: UpdateRoleDto,
  ): Promise<{
    id: string;
    name: string;
    description: string | null;
    active: boolean;
    permissions: string[];
  }> {
    const role = await this.findTenantRoleOrFail(tenantId, roleUuid);

    if (dto.name) {
      const nextName = this.normalizeName(dto.name);

      if (nextName !== role.name) {
        const conflict = await this.tenantRoleRepo.findOne({
          where: { tenantId, name: nextName, active: true },
        });

        if (conflict && conflict.uuid !== roleUuid) {
          throw new BadRequestException('Já existe uma role com este nome no tenant');
        }

        role.name = nextName;
      }
    }

    if (dto.description !== undefined) {
      role.description = dto.description;
    }

    const saved = await this.tenantRoleRepo.save(role);

    return {
      id: saved.uuid,
      name: saved.name,
      description: saved.description,
      active: saved.active,
      permissions: await this.listRolePermissionSlugs(tenantId, saved.id),
    };
  }

  async deleteRole(tenantId: string, roleUuid: string): Promise<void> {
    const role = await this.findTenantRoleOrFail(tenantId, roleUuid);
    role.active = false;
    await this.tenantRoleRepo.save(role);
    await this.tenantRoleRepo.softDelete({ id: role.id });
  }

  async updateRolePermissions(
    tenantId: string,
    roleUuid: string,
    permissionSlugs: string[],
  ): Promise<{
    id: string;
    name: string;
    description: string | null;
    active: boolean;
    permissions: string[];
  }> {
    const role = await this.findTenantRoleOrFail(tenantId, roleUuid);
    const normalized = Array.from(new Set(permissionSlugs.map((slug) => slug.trim())));

    if (normalized.length > 0) {
      const permissions = await this.permissionRepo.find({
        where: { slug: In(normalized) },
      });

      const found = new Set(permissions.map((perm) => perm.slug));
      const invalid = normalized.filter((slug) => !found.has(slug));
      if (invalid.length > 0) {
        throw new BadRequestException(
          `Permissões inválidas: ${invalid.join(', ')}`,
        );
      }
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

    return {
      id: role.uuid,
      name: role.name,
      description: role.description,
      active: role.active,
      permissions: await this.listRolePermissionSlugs(tenantId, role.id),
    };
  }
}
