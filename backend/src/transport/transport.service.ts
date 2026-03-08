import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transport } from './entities/transport.entity';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';

@Injectable()
export class TransportService {
  constructor(
    @InjectRepository(Transport)
    private readonly transportRepo: Repository<Transport>,
  ) {}

  async create(
    dto: { uuid: string; razao_social: string; cnpj?: string; telefone?: string; endereco_completo?: string },
    tenantId: string,
  ): Promise<Transport> {
    const t = this.transportRepo.create({ ...dto, tenant_id: tenantId });
    return this.transportRepo.save(t);
  }

  async findAll(
    tenantId: string,
    pagination: PaginationDto,
    search?: string,
  ): Promise<PaginatedResponse<Transport>> {
    const { page = 1, limit = 20 } = pagination;

    const qb = this.transportRepo
      .createQueryBuilder('t')
      .where('t.tenant_id = :tenantId', { tenantId })
      .andWhere('t.deleted_at IS NULL');

    if (search) {
      qb.andWhere(
        '(t.razao_social ILIKE :search OR t.cnpj ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const [data, total] = await qb
      .orderBy('t.razao_social', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(uuid: string, tenantId: string): Promise<Transport> {
    const t = await this.transportRepo.findOne({ where: { uuid, tenant_id: tenantId } });
    if (!t) throw new NotFoundException(`Transportadora ${uuid} não encontrada.`);
    return t;
  }

  async update(uuid: string, dto: Record<string, unknown>, tenantId: string): Promise<Transport> {
    const t = await this.findOne(uuid, tenantId);
    Object.assign(t, dto);
    return this.transportRepo.save(t);
  }

  async remove(uuid: string, tenantId: string): Promise<void> {
    const t = await this.findOne(uuid, tenantId);
    await this.transportRepo.softDelete(t.id);
  }
}
