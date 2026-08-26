import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { DEFAULT_ROLE_PERMISSIONS, ROLE_TEMPLATE_NAMES, SYSTEM_ROLE_NAMES } from '@renowa/shared';
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

  /**
   * Não existe mais fallback para `'viewer'`. Esse default era o gatilho do
   * defeito: nome sem template vira tenant_role sem permissão, o usuário loga
   * e leva 403 em todo endpoint. Perfil agora é escolha explícita, e
   * `resolveAssignableRole` recusa nome que ninguém sabe provisionar.
   */
  private normalizeRoleName(role: string): string {
    const normalized = role?.trim().toLowerCase() ?? '';
    if (!normalized) {
      throw new BadRequestException('Perfil de acesso é obrigatório.');
    }
    return normalized;
  }

  /**
   * Resolve o perfil a ser atribuído a um usuário, na transação de quem chama.
   *
   * Perfil que já existe no tenant — inclusive os criados sob medida na tela de
   * Perfis — é usado como está. Perfil inexistente só é provisionado se houver
   * template em `DEFAULT_ROLE_PERMISSIONS`; fora disso, 400. A alternativa
   * antiga (criar a role vazia e seguir) empurrava a falha para o primeiro
   * request do usuário, onde nada apontava a causa.
   */
  private async resolveAssignableRole(
    manager: EntityManager,
    tenantId: string,
    rawRole: string,
  ): Promise<TenantRole> {
    const roleName = this.normalizeRoleName(rawRole);

    const existing = await manager.getRepository(TenantRole).findOne({
      where: { tenantId, name: roleName, active: true },
    });
    if (existing) return existing;

    if (!DEFAULT_ROLE_PERMISSIONS[roleName]?.length) {
      throw new BadRequestException(
        `Perfil '${roleName}' não existe neste tenant. Crie o perfil em Perfis de acesso `
        + `ou use um dos modelos: ${ROLE_TEMPLATE_NAMES.join(', ')}.`,
      );
    }

    return this.ensureTenantRoleWith(manager, tenantId, roleName);
  }

  /**
   * Contexto do usuário logado. Apenas leitura.
   *
   * Já foi o lugar onde `local_users` nascia sozinho, com e-mail forjado
   * (`${sub}@placeholder.local`) e perfil vindo do `defaultRole` do JWT — resto
   * da arquitetura OIDC anterior. Com auth nativa, JWT só existe para linha em
   * `usuarios`, e `createTenantUser` grava `local_users` na mesma transação;
   * `LocalUserContextGuard` recusa com 403 antes daqui quando falta. Criar
   * usuário implicitamente aqui era, na prática, signup silencioso (PROB-0057).
   */
  async getCurrentUserContext(params: {
    authUserId: string;
    tenantId: string;
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
    const hydrated = await this.localUserRepo.findOne({
      where: {
        authUserId: params.authUserId,
        tenantId: params.tenantId,
      },
      relations: ['role', 'role.rolePermissions', 'role.rolePermissions.permission'],
    });

    if (!hydrated) {
      throw new ForbiddenException(
        'Usuário sem acesso local neste tenant. Um administrador precisa criá-lo em Usuários.',
      );
    }

    const rolePermissions = hydrated.role?.rolePermissions ?? [];
    const permissions = Array.from(
      new Set(rolePermissions.map((entry) => entry.permission.slug)),
    );

    return {
      user: {
        id: hydrated.uuid,
        authUserId: hydrated.authUserId,
        email: hydrated.email,
        role: hydrated.role?.name ?? '',
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
    const senha_hash = await this.passwords.hash(dto.senha);

    return this.dataSource.transaction(async (manager) => {
      const emailTaken = await manager.getRepository(User).findOne({
        where: { email: dto.email, deleted_at: IsNull() },
      });
      if (emailTaken) {
        throw new BadRequestException('Email já cadastrado');
      }

      // Perfil resolvido antes de gravar o usuário: perfil inválido não pode
      // deixar `usuarios` criado e `local_users` não.
      const role = await this.resolveAssignableRole(manager, tenantId, dto.role);
      const roleName = role.name;

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
   * Provisionamento explícito: cria a tenant_role sob demanda já com is_system
   * e as permissões do template (`DEFAULT_ROLE_PERMISSIONS` em `@renowa/shared`),
   * na mesma transação. Só é chamado por `resolveAssignableRole`, que garante
   * a existência do template — nome desconhecido não chega aqui.
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
        // Sem `active: true` aqui, a corrida devolvia uma role soft-deleted —
        // perfil morto voltando a ser atribuído a usuário novo.
        const concurrent = await repo.findOne({ where: { tenantId, name: roleName, active: true } });
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
    let nextRoleName = existing.role?.name ?? '';

    const senhaHash = dto.new_password ? await this.passwords.hash(dto.new_password) : undefined;
    const identityChanged = dto.role !== undefined || dto.active !== undefined || senhaHash !== undefined;

    await this.dataSource.transaction(async (manager) => {
      // Troca de perfil passa pela mesma resolução da criação: perfil existente
      // do tenant, ou template conhecido — nunca uma role nova e vazia.
      if (dto.role) {
        const role = await this.resolveAssignableRole(manager, tenantId, dto.role);
        nextRoleId = role.id;
        nextRoleName = role.name;
      }

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
