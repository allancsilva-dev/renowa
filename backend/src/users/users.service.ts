import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findByUuidAndTenant(uuid: string, tenantId: string): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { uuid, tenant_id: tenantId },
    });

    if (!user) {
      throw new NotFoundException(`Usuário ${uuid} não encontrado no tenant`);
    }

    return user;
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

    return this.userRepo.save(user);
  }
}
