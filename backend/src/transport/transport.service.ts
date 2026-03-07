import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transport } from './entities/transport.entity';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';

export class CreateTransportDto {
  razao_social: string;
  nome_fantasia?: string;
  cnpj?: string;
  email?: string;
  telefone?: string;
}

@Injectable()
export class TransportService {
  constructor(
    @InjectRepository(Transport)
    private readonly transportRepo: Repository<Transport>,
  ) {}

  async create(dto: CreateTransportDto, tenantId: string): Promise<Transport> {
    const t = this.transportRepo.create({ ...dto, tenant_id: tenantId });
    return this.transportRepo.save(t);
  }

  async findAll(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponse<Transport>> {
    const { page = 1, limit = 20 } = pagination;
    const [data, total] = await this.transportRepo.findAndCount({
      where: { tenant_id: tenantId },
      order: { razao_social: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(uuid: string, tenantId: string): Promise<Transport> {
    const t = await this.transportRepo.findOne({ where: { uuid, tenant_id: tenantId } });
    if (!t) throw new NotFoundException(`Transportadora ${uuid} não encontrada`);
    return t;
  }

  async update(uuid: string, dto: Partial<CreateTransportDto>, tenantId: string): Promise<Transport> {
    const t = await this.findOne(uuid, tenantId);
    Object.assign(t, dto);
    return this.transportRepo.save(t);
  }

  async remove(uuid: string, tenantId: string): Promise<void> {
    const t = await this.findOne(uuid, tenantId);
    await this.transportRepo.softDelete(t.id);
  }
}
