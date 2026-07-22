import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Supplier } from './entities/supplier.entity';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
  ) {}

  async create(dto: CreateSupplierDto, tenantId: string): Promise<Supplier> {
    const s = this.supplierRepo.create({ ...dto, tenant_id: tenantId });
    return this.supplierRepo.save(s);
  }

  async findAll(
    tenantId: string,
    pagination: PaginationDto,
    search?: string,
  ): Promise<PaginatedResponse<Supplier>> {
    const { page = 1, limit = 20 } = pagination;
    const qb = this.supplierRepo
      .createQueryBuilder('s')
      .where('s.tenant_id = :tenantId', { tenantId })
      .andWhere('s.deleted_at IS NULL');

    if (search) {
      qb.andWhere('(s.razao_social ILIKE :s OR s.cnpj ILIKE :s)', { s: `%${search}%` });
    }

    const [data, total] = await qb
      .orderBy('s.razao_social', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(uuid: string, tenantId: string): Promise<Supplier> {
    const s = await this.supplierRepo.findOne({ where: { uuid, tenant_id: tenantId } });
    if (!s) throw new NotFoundException(`Fornecedor ${uuid} não encontrado.`);
    return s;
  }

  async update(uuid: string, dto: UpdateSupplierDto, tenantId: string): Promise<Supplier> {
    const s = await this.findOne(uuid, tenantId);
    const { uuid: _u, ...rest } = dto;
    Object.assign(s, rest);
    return this.supplierRepo.save(s);
  }

  async remove(uuid: string, tenantId: string): Promise<void> {
    const s = await this.findOne(uuid, tenantId);
    await this.supplierRepo.softDelete(s.id);
  }
}
