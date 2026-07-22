import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { DEFAULT_ROLE_PERMISSIONS, SYSTEM_ROLE_NAMES } from '@renowa/shared';
import { User } from './entities/user.entity';
import { LocalUser } from '../rbac/entities/local-user.entity';
import { TenantRole } from '../rbac/entities/tenant-role.entity';
import { TenantRolePermission } from '../rbac/entities/tenant-role-permission.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PasswordService } from '../auth/password.service';
import { AuditService } from '../audit/audit.service';
import { RequestUser } from '../common/types/jwt-payload.type';

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
    private readonly passwords: PasswordService,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
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
    return this.dataSource.transaction((manager) =>
      this.ensureTenantRoleWith(manager, tenantId, roleName),
    );
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

  async listTenantUsers(tenantId: string, actor?: RequestUser): Promise<Array<{
    id: string;
    authUserId: string;
    name: string;
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

    const identities = users.length
      ? await this.userRepo.find({
          where: { tenant_id: tenantId, uuid: In(users.map((entry) => entry.authUserId)) },
          select: { uuid: true, nome: true },
        })
      : [];
    const namesByAuthUserId = new Map(identities.map((identity) => [identity.uuid, identity.nome]));

    const result = users.map((entry) => ({
      id: entry.uuid,
      authUserId: entry.authUserId,
      name: namesByAuthUserId.get(entry.authUserId) ?? entry.email,
      email: entry.email,
      role: entry.role?.name ?? 'viewer',
      tenantId: entry.tenantId,
      active: entry.active,
    }));
    if (actor) await this.audit.record({ tenantId, actor, action: 'READ', resourceType: 'usuario',
      fields: ['email', 'role', 'active'], purpose: 'Administração de usuários do tenant', metadata: { resultCount: result.length } });
    return result;
  }

  /**
   * Auth nativa: cria o usuário em `usuarios` (com senha_hash) e o espelho
   * `local_users` numa única transação. Email é global único.
   */
  async createTenantUser(
    tenantId: string,
    dto: CreateUserDto,
    actor?: RequestUser,
  ): Promise<{
    id: string;
    authUserId: string;
    email: string;
    role: string;
    tenantId: string;
    active: boolean;
  }> {
    const roleName = this.normalizeRoleName(dto.role);
    const senha_hash = await this.passwords.hash(dto.senha);

    return this.dataSource.transaction(async (manager) => {
      const emailTaken = await manager.getRepository(User).findOne({
        where: { email: dto.email, deleted_at: IsNull() },
      });
      if (emailTaken) {
        throw new BadRequestException('Email já cadastrado');
      }

      const userUuid = randomUUID();
      const savedUser = await manager.getRepository(User).save(
        manager.getRepository(User).create({
          uuid: userUuid,
          tenant_id: tenantId,
          email: dto.email,
          nome: dto.nome,
          senha_hash,
          roles: [roleName],
          is_active: true,
        }),
      );

      const role = await this.ensureTenantRoleWith(manager, tenantId, roleName);
      const localUser = await manager.getRepository(LocalUser).save(
        manager.getRepository(LocalUser).create({
          tenantId,
          authUserId: savedUser.uuid,
          email: dto.email,
          roleId: role.id,
          active: true,
        }),
      );

      const result = {
        id: localUser.uuid,
        authUserId: localUser.authUserId,
        email: localUser.email,
        role: role.name,
        tenantId,
        active: localUser.active,
      };
      if (actor) await this.audit.record({ tenantId, actor, action: 'CREATE', resourceType: 'usuario',
        resourceUuid: savedUser.uuid, fields: ['email', 'nome', 'roles'], purpose: 'Administração de usuários do tenant' }, manager);
      return result;
    });
  }

  /**
   * Provisionamento explícito: cria a tenant_role sob demanda (primeiro login
   * via defaultRole do JWT, ou role digitada na criação de usuário nativo) já
   * com is_system e as permissões padrão do template (DEFAULT_ROLE_PERMISSIONS
   * em @renowa/shared), na mesma transação. Um nome fora do template é
   * provisionado sem nenhuma permissão — fail-closed até um admin conceder
   * explicitamente pela tela de Perfis.
   */
  private async ensureTenantRoleWith(
    manager: EntityManager,
    tenantId: string,
    roleName: string,
  ): Promise<TenantRole> {
    const repo = manager.getRepository(TenantRole);
    const existing = await repo.findOne({
      where: { tenantId, name: roleName, active: true },
    });
    if (existing) return existing;

    const created = repo.create({
      tenantId,
      name: roleName,
      description: roleName === 'admin'
        ? 'Role administrativa padrão'
        : 'Role provisionada automaticamente',
      active: true,
      isSystem: SYSTEM_ROLE_NAMES.includes(roleName),
    });

    let role: TenantRole;
    try {
      role = await repo.save(created);
    } catch (err: any) {
      if (err?.code === '23505') {
        const concurrent = await repo.findOne({ where: { tenantId, name: roleName } });
        if (concurrent) return concurrent;
      }
      throw err;
    }

    const defaultSlugs = DEFAULT_ROLE_PERMISSIONS[roleName];
    if (defaultSlugs?.length) {
      const permissionRepo = manager.getRepository(TenantRolePermission);
      await permissionRepo.insert(
        defaultSlugs.map((slug) => permissionRepo.create({ tenantId, roleId: role.id, permissionSlug: slug })),
      );
    }

    return role;
  }

  async updateTenantUser(
    tenantId: string,
    userUuid: string,
    dto: UpdateUserDto,
    actor?: RequestUser,
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

    const senhaHash = dto.new_password ? await this.passwords.hash(dto.new_password) : undefined;
    const identityChanged = dto.role !== undefined || dto.active !== undefined || senhaHash !== undefined;

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(LocalUser).update(existing.id, {
        roleId: nextRoleId,
        active: dto.active ?? existing.active,
      });

      if (identityChanged) {
        const userPatch: Partial<User> = {
          roles: [nextRoleName],
          is_active: dto.active ?? existing.active,
        };
        if (senhaHash) userPatch.senha_hash = senhaHash;
        await manager.getRepository(User).update(
          { uuid: existing.authUserId, tenant_id: tenantId },
          userPatch,
        );
        await manager.getRepository(User).increment(
          { uuid: existing.authUserId, tenant_id: tenantId },
          'access_token_version',
          1,
        );
        if (senhaHash || dto.active === false) {
          await manager.query(
            `UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, clock_timestamp())
             WHERE tenant_id = $1 AND user_id = (SELECT id FROM usuarios WHERE tenant_id = $1 AND uuid = $2)`,
            [tenantId, existing.authUserId],
          );
        }
      }
    });

    const updated = await this.localUserRepo.findOneOrFail({
      where: { tenantId, uuid: userUuid },
    });

    const result = {
      id: updated.uuid,
      authUserId: updated.authUserId,
      email: updated.email,
      role: nextRoleName,
      tenantId: updated.tenantId,
      active: updated.active,
    };
    if (actor) await this.audit.record({ tenantId, actor, action: 'UPDATE', resourceType: 'usuario',
      resourceUuid: updated.authUserId, fields: Object.keys(dto).filter((field) => field !== 'new_password').concat(dto.new_password ? ['senha_hash'] : []),
      purpose: 'Administração de usuários do tenant' });
    return result;
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
