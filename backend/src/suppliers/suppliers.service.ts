import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Supplier } from './entities/supplier.entity';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
  ) {}

  async create(dto: { uuid: string; razao_social: string; cnpj?: string }, tenantId: string): Promise<Supplier> {
    const s = this.supplierRepo.create({ ...dto, tenant_id: tenantId });
    return this.supplierRepo.save(s);
  }

  async findAll(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponse<Supplier>> {
    const { page = 1, limit = 20 } = pagination;
    const [data, total] = await this.supplierRepo.findAndCount({
      where: { tenant_id: tenantId },
      order: { razao_social: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(uuid: string, tenantId: string): Promise<Supplier> {
    const s = await this.supplierRepo.findOne({ where: { uuid, tenant_id: tenantId } });
    if (!s) throw new NotFoundException(`Fornecedor ${uuid} não encontrado.`);
    return s;
  }

  async update(uuid: string, dto: Record<string, unknown>, tenantId: string): Promise<Supplier> {
    const s = await this.findOne(uuid, tenantId);
    Object.assign(s, dto);
    return this.supplierRepo.save(s);
  }

  async remove(uuid: string, tenantId: string): Promise<void> {
    const s = await this.findOne(uuid, tenantId);
    await this.supplierRepo.softDelete(s.id);
  }
}
