import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Supplier } from './entities/supplier.entity';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { ImportResultDto } from '../common/csv/import-result.dto';
import { importCnpjEntity, parseCsvRows, pick } from '../common/csv/csv-import.util';
import { onlyDigits } from '../common/csv/csv-import.util';
import { rethrowCnpjUniqueViolation } from '../common/persistence/cnpj-conflict';

const IMPORT_MAX_ROWS = 5000;

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateSupplierDto, tenantId: string): Promise<Supplier> {
    await this.ensureCnpjAvailable(dto.cnpj, tenantId);
    const s = this.supplierRepo.create({ ...dto, tenant_id: tenantId });
    try {
      return await this.supplierRepo.save(s);
    } catch (error) {
      return rethrowCnpjUniqueViolation(error, 'fornecedores');
    }
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
    if (Object.prototype.hasOwnProperty.call(dto, 'cnpj')) {
      await this.ensureCnpjAvailable(dto.cnpj, tenantId, uuid);
    }
    const { uuid: _u, ...rest } = dto;
    Object.assign(s, rest);
    try {
      return await this.supplierRepo.save(s);
    } catch (error) {
      return rethrowCnpjUniqueViolation(error, 'fornecedores');
    }
  }

  async cnpjAvailability(cnpj: string | undefined, tenantId: string, excludeUuid?: string) {
    const digits = onlyDigits(cnpj);
    if (!digits) return { available: true };
    const qb = this.supplierRepo.createQueryBuilder('s')
      .where('s.tenant_id = :tenantId', { tenantId })
      .andWhere('s.deleted_at IS NULL')
      .andWhere("regexp_replace(COALESCE(s.cnpj, ''), '\\D', '', 'g') = :cnpj", { cnpj: digits });
    if (excludeUuid) qb.andWhere('s.uuid <> :excludeUuid', { excludeUuid });
    return { available: !(await qb.getOne()) };
  }

  private async ensureCnpjAvailable(cnpj: string | null | undefined, tenantId: string, excludeUuid?: string): Promise<void> {
    if (!cnpj) return;
    if (!(await this.cnpjAvailability(cnpj, tenantId, excludeUuid)).available) {
      throw new ConflictException('Este CNPJ já existe no cadastro de fornecedores.');
    }
  }

  async remove(uuid: string, tenantId: string): Promise<void> {
    const s = await this.findOne(uuid, tenantId);
    await this.supplierRepo.softDelete(s.id);
  }

  /**
   * Importação em massa (.csv). Upsert por CNPJ dentro do tenant; falhas por
   * linha não interrompem o processamento.
   */
  async importFromFile(
    file: Express.Multer.File | undefined,
    tenantId: string,
  ): Promise<ImportResultDto> {
    const rows = parseCsvRows(file, IMPORT_MAX_ROWS);

    return this.dataSource.transaction((manager) =>
      importCnpjEntity<Supplier>({
        rows,
        repo: manager.getRepository(Supplier),
        tenantId,
        buildFields: (row) => {
          const razao_social = pick(row, 'razao_social', 'razão_social', 'razao social');
          const cnpj = pick(row, 'cnpj');
          const chave = razao_social ?? cnpj ?? '';
          if (!razao_social) return { erro: 'Razão social é obrigatória.', chave };
          const uf = pick(row, 'uf');
          if (uf !== undefined && uf.length !== 2) return { erro: 'UF deve ter 2 letras.', chave };
          return {
            chave,
            cnpj,
            fields: {
              razao_social,
              cnpj: cnpj ?? undefined,
              endereco: pick(row, 'endereco', 'endereço'),
              numero: pick(row, 'numero', 'número'),
              complemento: pick(row, 'complemento'),
              bairro: pick(row, 'bairro'),
              cidade: pick(row, 'cidade'),
              uf,
              cep: pick(row, 'cep'),
              telefone: pick(row, 'telefone'),
              inscricao_estadual: pick(row, 'inscricao_estadual', 'inscrição_estadual', 'ie'),
            },
          };
        },
      }),
    );
  }
}
