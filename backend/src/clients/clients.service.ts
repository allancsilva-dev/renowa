import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Client } from './entities/client.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateClientDto, tenantId: string): Promise<Client> {
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
    return this.clientRepo.save(client);
  }

  async findAll(
    tenantId: string,
    pagination: PaginationDto,
    search?: string,
  ): Promise<PaginatedResponse<Client>> {
    const { page = 1, limit = 20 } = pagination;

    const qb = this.clientRepo
      .createQueryBuilder('c')
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

  async update(uuid: string, dto: UpdateClientDto, tenantId: string): Promise<Client> {
    const client = await this.findOne(uuid, tenantId);
    const { transportadora_uuid: _t, uuid: _u, ...rest } = dto;
    Object.assign(client, rest);
    return this.clientRepo.save(client);
  }

  async remove(uuid: string, tenantId: string): Promise<void> {
    const client = await this.findOne(uuid, tenantId);
    await this.clientRepo.softDelete(client.id);
  }
}
