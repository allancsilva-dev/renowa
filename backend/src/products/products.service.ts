import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';
import { SuppliersService } from '../suppliers/suppliers.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly suppliersService: SuppliersService,
  ) {}

  async create(dto: CreateProductDto, tenantId: string): Promise<Product> {
    let fornecedor_id: number | null = null;

    if (dto.fornecedor_uuid) {
      // CHANGELOG #3: UUID→ID resolution
      const supplier = await this.suppliersService.findOne(dto.fornecedor_uuid, tenantId);
      fornecedor_id = supplier.id;
    }

    const product = this.productRepo.create({
      ...dto,
      fornecedor_id,
      tenant_id: tenantId,
    });

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
        '(p.descricao ILIKE :search OR p.codigo ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const [data, total] = await qb
      .orderBy('p.descricao', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(uuid: string, tenantId: string): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: { uuid, tenant_id: tenantId },
      relations: ['fornecedor'],
    });

    if (!product) throw new NotFoundException(`Produto ${uuid} não encontrado`);
    return product;
  }

  async update(uuid: string, dto: Partial<CreateProductDto>, tenantId: string): Promise<Product> {
    const product = await this.findOne(uuid, tenantId);
    Object.assign(product, dto);
    return this.productRepo.save(product);
  }

  async remove(uuid: string, tenantId: string): Promise<void> {
    const product = await this.findOne(uuid, tenantId);
    await this.productRepo.softDelete(product.id);
  }
}
