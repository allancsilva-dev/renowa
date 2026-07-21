import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Client } from './entities/client.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';
import { AuditService } from '../audit/audit.service';
import { RequestUser } from '../common/types/jwt-payload.type';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateClientDto, user: RequestUser): Promise<Client> {
    const tenantId = user.tenantId;
    let transportadora_id: number | null = null;

    if (dto.transportadora_uuid) {
      const result = await this.dataSource.query(
        `SELECT id FROM transportadoras WHERE uuid = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [dto.transportadora_uuid, tenantId],
      );
      if (result[0]) transportadora_id = result[0].id as number;
    }

    const { transportadora_uuid: _t, uuid, ...rest } = dto;
    const client = this.clientRepo.create({
      ...rest,
      uuid,
      transportadora_id,
      tenant_id: tenantId,
    });
    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.getRepository(Client).save(client);
      await this.audit.record({ tenantId, actor: user, action: 'CREATE', resourceType: 'cliente',
        resourceUuid: saved.uuid, fields: Object.keys(rest), purpose: 'Cadastro operacional de cliente' }, manager);
      return saved;
    });
  }

  async findAll(
    user: RequestUser,
    pagination: PaginationDto,
    search?: string,
  ): Promise<PaginatedResponse<Client>> {
    const { page = 1, limit = 20 } = pagination;
    const tenantId = user.tenantId;

    const qb = this.clientRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.transportadora', 'transportadora')
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere('c.deleted_at IS NULL');

    if (search) {
      qb.andWhere(
        '(c.razao_social ILIKE :s OR c.cnpj ILIKE :s OR c.cidade ILIKE :s OR c.contato ILIKE :s)',
        { s: `%${search}%` },
      );
    }

    const [data, total] = await qb
      .orderBy('c.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    await this.audit.record({ tenantId, actor: user, action: 'READ', resourceType: 'cliente',
      fields: ['razao_social', 'cnpj', 'email', 'tel', 'endereco', 'contato'],
      purpose: 'Consulta operacional da carteira de clientes', metadata: { resultCount: data.length } });
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(uuid: string, tenantId: string): Promise<Client> {
    const client = await this.clientRepo.findOne({
      where: { uuid, tenant_id: tenantId },
      relations: ['transportadora'],
    });
    if (!client) throw new NotFoundException(`Cliente ${uuid} não encontrado.`);
    return client;
  }

  async findOneForUser(uuid: string, user: RequestUser): Promise<Client> {
    const client = await this.findOne(uuid, user.tenantId);
    await this.audit.record({ tenantId: user.tenantId, actor: user, action: 'READ', resourceType: 'cliente',
      resourceUuid: uuid, fields: ['razao_social', 'cnpj', 'email', 'tel', 'endereco', 'contato'],
      purpose: 'Consulta operacional de cliente' });
    return client;
  }

  async update(uuid: string, dto: UpdateClientDto, user: RequestUser): Promise<Client> {
    const tenantId = user.tenantId;
    const client = await this.findOne(uuid, tenantId);
    const { transportadora_uuid: _t, uuid: _u, ...rest } = dto;
    Object.assign(client, rest);
    if (Object.prototype.hasOwnProperty.call(dto, 'transportadora_uuid')) {
      client.transportadora_id = dto.transportadora_uuid
        ? await this.resolveTransport(dto.transportadora_uuid, tenantId)
        : null;
    }
    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.getRepository(Client).save(client);
      await this.audit.record({ tenantId, actor: user, action: 'UPDATE', resourceType: 'cliente',
        resourceUuid: uuid, fields: Object.keys(rest), purpose: 'Atualização operacional de cliente' }, manager);
      return saved;
    });
  }

  private async resolveTransport(uuid: string, tenantId: string): Promise<number> {
    const result = await this.dataSource.query(
      `SELECT id FROM transportadoras WHERE uuid = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [uuid, tenantId],
    ) as Array<{ id: number }>;
    if (!result[0]) throw new NotFoundException('Transportadora não encontrada.');
    return result[0].id;
  }

  async remove(uuid: string, user: RequestUser): Promise<void> {
    const tenantId = user.tenantId;
    const client = await this.findOne(uuid, tenantId);
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Client).softDelete(client.id);
      await this.audit.record({ tenantId, actor: user, action: 'DELETE', resourceType: 'cliente',
        resourceUuid: uuid, purpose: 'Exclusão operacional de cliente' }, manager);
    });
  }
}
