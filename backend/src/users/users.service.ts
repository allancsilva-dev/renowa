import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { LocalUser } from '../rbac/entities/local-user.entity';
import { TenantRole } from '../rbac/entities/tenant-role.entity';
import { TenantRolePermission } from '../rbac/entities/tenant-role-permission.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthApiService } from '../auth-api/auth-api.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(LocalUser)
    private readonly localUserRepo: Repository<LocalUser>,
    @InjectRepository(TenantRole)
    private readonly tenantRoleRepo: Repository<TenantRole>,
    @InjectRepository(TenantRolePermission)
    private readonly tenantRolePermissionRepo: Repository<TenantRolePermission>,
    private readonly authApiService: AuthApiService,
  ) {}

  private normalizeRoleName(defaultRole?: string): string {
    const role = (defaultRole ?? 'viewer').trim().toLowerCase();

    if (!role) return 'viewer';
    return role;
  }

  private async ensureTenantRole(
    tenantId: string,
    roleName: string,
  ): Promise<TenantRole> {
    const existing = await this.tenantRoleRepo.findOne({
      where: { tenantId, name: roleName, active: true },
    });

    if (existing) return existing;

    const created = this.tenantRoleRepo.create({
      tenantId,
      name: roleName,
      description: roleName === 'admin'
        ? 'Role administrativa padrão'
        : 'Role provisionada automaticamente',
      active: true,
    });

    try {
      return await this.tenantRoleRepo.save(created);
    } catch (err: any) {
      if (err?.code === '23505') {
        const concurrent = await this.tenantRoleRepo.findOne({
          where: { tenantId, name: roleName },
        });
        if (concurrent) return concurrent;
      }
      throw err;
    }
  }

  async getCurrentUserContext(params: {
    authUserId: string;
    tenantId: string;
    email: string;
    defaultRole?: string;
  }): Promise<{
    user: {
      id: string;
      authUserId: string;
      email: string;
      role: string;
      tenantId: string;
      active: boolean;
    };
    permissions: string[];
  }> {
    const roleName = this.normalizeRoleName(params.defaultRole);
    const tenantRole = await this.ensureTenantRole(params.tenantId, roleName);

    let localUser = await this.localUserRepo.findOne({
      where: {
        authUserId: params.authUserId,
        tenantId: params.tenantId,
      },
      relations: ['role', 'role.rolePermissions', 'role.rolePermissions.permission'],
    });

    if (!localUser) {
      const created = this.localUserRepo.create({
        tenantId: params.tenantId,
        authUserId: params.authUserId,
        email: params.email,
        roleId: tenantRole.id,
        active: true,
      });

      try {
        localUser = await this.localUserRepo.save(created);
      } catch (err: any) {
        if (err?.code === '23505') {
          const concurrent = await this.localUserRepo.findOne({
            where: {
              authUserId: params.authUserId,
              tenantId: params.tenantId,
            },
          });
          if (concurrent) {
            localUser = concurrent;
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
    } else {
      const nextRoleId = localUser.roleId ?? tenantRole.id;
      const shouldUpdateEmail = localUser.email !== params.email;
      const shouldUpdateRole = localUser.roleId !== nextRoleId;

      if (shouldUpdateEmail || shouldUpdateRole) {
        await this.localUserRepo.update(localUser.id, {
          email: params.email,
          roleId: nextRoleId,
        });
      }
    }

    const hydrated = await this.localUserRepo.findOneOrFail({
      where: {
        authUserId: params.authUserId,
        tenantId: params.tenantId,
      },
      relations: ['role', 'role.rolePermissions', 'role.rolePermissions.permission'],
    });

    const rolePermissions = hydrated.role?.rolePermissions ?? [];
    const permissions = Array.from(
      new Set(rolePermissions.map((entry) => entry.permission.slug)),
    );

    return {
      user: {
        id: hydrated.uuid,
        authUserId: hydrated.authUserId,
        email: hydrated.email,
        role: hydrated.role?.name ?? roleName,
        tenantId: hydrated.tenantId,
        active: hydrated.active,
      },
      permissions,
    };
  }

  async findAnyLocalUserByAuthUserId(authUserId: string): Promise<LocalUser | null> {
    return this.localUserRepo.findOne({
      where: { authUserId },
      relations: ['role', 'role.rolePermissions', 'role.rolePermissions.permission'],
      order: { id: 'ASC' },
    });
  }

  async findLocalUserByAuthUserIdAndTenant(
    authUserId: string,
    tenantId: string,
  ): Promise<LocalUser | null> {
    return this.localUserRepo.findOne({
      where: {
        authUserId,
        tenantId,
      },
      relations: ['role', 'role.rolePermissions', 'role.rolePermissions.permission'],
    });
  }

  async findTenantRoleByName(
    tenantId: string,
    roleName: string,
  ): Promise<TenantRole | null> {
    return this.tenantRoleRepo.findOne({
      where: {
        tenantId,
        name: this.normalizeRoleName(roleName),
        active: true,
      },
    });
  }

  async createLocalUser(params: {
    tenantId: string;
    authUserId: string;
    email: string;
    roleId: number;
  }): Promise<LocalUser> {
    const created = this.localUserRepo.create({
      tenantId: params.tenantId,
      authUserId: params.authUserId,
      email: params.email,
      roleId: params.roleId,
      active: true,
      lastLoginAt: null,
    });

    return this.localUserRepo.save(created);
  }

  async touchLocalUserLastLogin(localUserId: number): Promise<void> {
    await this.localUserRepo.update(localUserId, {
      lastLoginAt: new Date(),
    });
  }

  async listTenantUsers(tenantId: string): Promise<Array<{
    id: string;
    authUserId: string;
    email: string;
    role: string;
    tenantId: string;
    active: boolean;
  }>> {
    const users = await this.localUserRepo.find({
      where: { tenantId },
      relations: ['role'],
      order: { createdAt: 'ASC' },
    });

    return users.map((entry) => ({
      id: entry.uuid,
      authUserId: entry.authUserId,
      email: entry.email,
      role: entry.role?.name ?? 'viewer',
      tenantId: entry.tenantId,
      active: entry.active,
    }));
  }

  async createTenantUser(
    tenantId: string,
    dto: CreateUserDto,
  ): Promise<{
    id: string;
    authUserId: string;
    email: string;
    role: string;
    tenantId: string;
    active: boolean;
  }> {
    const roleName = this.normalizeRoleName(dto.role);
    const authUserId = await this.authApiService.resolveAuthUserIdByEmail(dto.email);

    if (!authUserId) {
      throw new UnprocessableEntityException(
        'Usuário não encontrado no ZonaDev Auth. O usuário precisa estar cadastrado no Auth antes de ser adicionado ao Renowa.',
      );
    }

    const role = await this.ensureTenantRole(tenantId, roleName);

    const existing = await this.localUserRepo.findOne({
      where: { tenantId, authUserId },
      relations: ['role'],
    });

    if (existing) {
      throw new BadRequestException('Usuário já existe neste tenant');
    }

    const created = this.localUserRepo.create({
      tenantId,
      authUserId,
      email: dto.email,
      roleId: role.id,
      active: true,
    });

    const saved = await this.localUserRepo.save(created);

    return {
      id: saved.uuid,
      authUserId: saved.authUserId,
      email: saved.email,
      role: role.name,
      tenantId: saved.tenantId,
      active: saved.active,
    };
  }

  async updateTenantUser(
    tenantId: string,
    userUuid: string,
    dto: UpdateUserDto,
  ): Promise<{
    id: string;
    authUserId: string;
    email: string;
    role: string;
    tenantId: string;
    active: boolean;
  }> {
    const existing = await this.localUserRepo.findOne({
      where: { tenantId, uuid: userUuid },
      relations: ['role'],
    });

    if (!existing) {
      throw new NotFoundException('Usuário não encontrado no tenant');
    }

    let nextRoleId = existing.roleId;
    let nextRoleName = existing.role?.name ?? 'viewer';

    if (dto.role) {
      const normalized = this.normalizeRoleName(dto.role);
      const role = await this.ensureTenantRole(tenantId, normalized);
      nextRoleId = role.id;
      nextRoleName = role.name;
    }

    await this.localUserRepo.update(existing.id, {
      roleId: nextRoleId,
      active: dto.active ?? existing.active,
    });

    const updated = await this.localUserRepo.findOneOrFail({
      where: { tenantId, uuid: userUuid },
    });

    return {
      id: updated.uuid,
      authUserId: updated.authUserId,
      email: updated.email,
      role: nextRoleName,
      tenantId: updated.tenantId,
      active: updated.active,
    };
  }

  async findByUuidAndTenant(uuid: string, tenantId: string): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { uuid, tenant_id: tenantId },
    });

    if (!user) {
      throw new NotFoundException(`Usuário ${uuid} não encontrado no tenant`);
    }

    return user;
  }

  async findOptionalByUuidAndTenant(
    uuid: string,
    tenantId: string,
  ): Promise<User | null> {
    return this.userRepo.findOne({
      where: { uuid, tenant_id: tenantId },
    });
  }

  async findAllByTenant(tenantId: string): Promise<User[]> {
    return this.userRepo.find({
      where: { tenant_id: tenantId, is_active: true },
      order: { nome: 'ASC' },
    });
  }

  /**
   * CHANGELOG #3: UUID→ID resolution — mobile envia uuid, servidor resolve para id.
   * Usado pelo SyncService antes de FKs.
   */
  async resolveUuidToId(uuid: string, tenantId: string): Promise<number> {
    const user = await this.findByUuidAndTenant(uuid, tenantId);
    return user.id;
  }

  async upsertFromJwt(params: {
    uuid: string;
    email: string;
    nome: string;
    roles: string[];
    tenantId: string;
  }): Promise<User> {
    const existing = await this.userRepo.findOne({
      where: { uuid: params.uuid, tenant_id: params.tenantId },
    });

    if (existing) {
      await this.userRepo.update(existing.id, {
        email: params.email,
        nome: params.nome,
        roles: params.roles,
        last_login_at: new Date(),
      });
      return { ...existing, ...params, last_login_at: new Date() };
    }

    const user = this.userRepo.create({
      uuid: params.uuid,
      tenant_id: params.tenantId,
      email: params.email,
      nome: params.nome,
      roles: params.roles,
      last_login_at: new Date(),
    });

    try {
      return await this.userRepo.save(user);
    } catch (err: any) {
      if (err?.code === '23505') {
        const concurrent = await this.userRepo.findOne({
          where: { uuid: params.uuid, tenant_id: params.tenantId },
        });

        if (concurrent) {
          await this.userRepo.update(concurrent.id, {
            email: params.email,
            nome: params.nome,
            last_login_at: new Date(),
          });
          return { ...concurrent, email: params.email, nome: params.nome, last_login_at: new Date() };
        }
      }

      throw err;
    }
  }
}
