import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from './entities/client.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
  ) {}

  async create(dto: CreateClientDto, tenantId: string): Promise<Client> {
    const client = this.clientRepo.create({ ...dto, tenant_id: tenantId });
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
        '(c.razao_social ILIKE :search OR c.nome_fantasia ILIKE :search OR c.cnpj_cpf ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const [data, total] = await qb
      .orderBy('c.razao_social', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(uuid: string, tenantId: string): Promise<Client> {
    const client = await this.clientRepo.findOne({
      where: { uuid, tenant_id: tenantId },
    });

    if (!client) throw new NotFoundException(`Cliente ${uuid} não encontrado`);
    return client;
  }

  async update(uuid: string, dto: UpdateClientDto, tenantId: string): Promise<Client> {
    const client = await this.findOne(uuid, tenantId);
    Object.assign(client, dto);
    return this.clientRepo.save(client);
  }

  async remove(uuid: string, tenantId: string): Promise<void> {
    const client = await this.findOne(uuid, tenantId);
    await this.clientRepo.softDelete(client.id);
  }
}
