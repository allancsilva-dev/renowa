import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateProductDto, tenantId: string): Promise<Product> {
    let fornecedor_id: number | null = null;

    if (dto.fornecedor_uuid) {
      const rows = await this.dataSource.query(
        `SELECT id FROM fornecedores WHERE uuid = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [dto.fornecedor_uuid, tenantId],
      );
      if (rows[0]) fornecedor_id = rows[0].id as number;
    }

    const { fornecedor_uuid: _f, uuid, ...rest } = dto;
    const product = this.productRepo.create({ ...rest, uuid, fornecedor_id, tenant_id: tenantId });
    return this.productRepo.save(product);
  }

  async findAll(
    tenantId: string,
    pagination: PaginationDto,
    search?: string,
  ): Promise<PaginatedResponse<Product>> {
    const { page = 1, limit = 20 } = pagination;

    const qb = this.productRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.fornecedor', 'f')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.deleted_at IS NULL');

    if (search) {
      qb.andWhere(
        '(p.descricao ILIKE :s OR p.codigo ILIKE :s)',
        { s: `%${search}%` },
      );
    }

    const [data, total] = await qb
      .orderBy('p.descricao', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(uuid: string, tenantId: string): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: { uuid, tenant_id: tenantId },
      relations: ['fornecedor'],
    });
    if (!product) throw new NotFoundException(`Produto ${uuid} não encontrado.`);
    return product;
  }

  async update(uuid: string, dto: Partial<CreateProductDto>, tenantId: string): Promise<Product> {
    const product = await this.findOne(uuid, tenantId);
    const { fornecedor_uuid: _f, uuid: _u, ...rest } = dto;
    Object.assign(product, rest);
    return this.productRepo.save(product);
  }

  async remove(uuid: string, tenantId: string): Promise<void> {
    const product = await this.findOne(uuid, tenantId);
    await this.productRepo.softDelete(product.id);
  }
}
