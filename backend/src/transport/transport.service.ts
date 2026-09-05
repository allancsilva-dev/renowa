import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Transport } from './entities/transport.entity';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';
import { CreateTransportDto } from './dto/create-transport.dto';
import { UpdateTransportDto } from './dto/update-transport.dto';
import { ImportResultDto } from '../common/csv/import-result.dto';
import { importCnpjEntity, onlyDigits, parseCsvRows, pick } from '../common/csv/csv-import.util';
import { rethrowCnpjUniqueViolation } from '../common/persistence/cnpj-conflict';

const IMPORT_MAX_ROWS = 5000;

@Injectable()
export class TransportService {
  constructor(
    @InjectRepository(Transport)
    private readonly transportRepo: Repository<Transport>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateTransportDto,
    tenantId: string,
  ): Promise<Transport> {
    await this.ensureCnpjAvailable(dto.cnpj, tenantId);
    const t = this.transportRepo.create({ ...dto, tenant_id: tenantId });
    try {
      return await this.transportRepo.save(t);
    } catch (error) {
      return rethrowCnpjUniqueViolation(error, 'transportadoras');
    }
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

  async update(uuid: string, dto: UpdateTransportDto, tenantId: string): Promise<Transport> {
    const t = await this.findOne(uuid, tenantId);
    if (Object.prototype.hasOwnProperty.call(dto, 'cnpj')) {
      await this.ensureCnpjAvailable(dto.cnpj, tenantId, uuid);
    }
    Object.assign(t, dto);
    try {
      return await this.transportRepo.save(t);
    } catch (error) {
      return rethrowCnpjUniqueViolation(error, 'transportadoras');
    }
  }

  async cnpjAvailability(cnpj: string | undefined, tenantId: string, excludeUuid?: string) {
    const digits = onlyDigits(cnpj);
    if (!digits) return { available: true };
    const qb = this.transportRepo.createQueryBuilder('t')
      .where('t.tenant_id = :tenantId', { tenantId })
      .andWhere('t.deleted_at IS NULL')
      .andWhere("regexp_replace(COALESCE(t.cnpj, ''), '\\D', '', 'g') = :cnpj", { cnpj: digits });
    if (excludeUuid) qb.andWhere('t.uuid <> :excludeUuid', { excludeUuid });
    return { available: !(await qb.getOne()) };
  }

  private async ensureCnpjAvailable(cnpj: string | null | undefined, tenantId: string, excludeUuid?: string): Promise<void> {
    if (!cnpj) return;
    if (!(await this.cnpjAvailability(cnpj, tenantId, excludeUuid)).available) {
      throw new ConflictException('Este CNPJ já existe no cadastro de transportadoras.');
    }
  }

  async remove(uuid: string, tenantId: string): Promise<void> {
    const t = await this.findOne(uuid, tenantId);
    await this.transportRepo.softDelete(t.id);
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
      importCnpjEntity<Transport>({
        rows,
        repo: manager.getRepository(Transport),
        tenantId,
        buildFields: (row) => {
          const razao_social = pick(row, 'razao_social', 'razão_social', 'razao social');
          const cnpj = pick(row, 'cnpj');
          const chave = razao_social ?? cnpj ?? '';
          if (!razao_social) return { erro: 'Razão social é obrigatória.', chave };
          return {
            chave,
            cnpj,
            fields: {
              razao_social,
              cnpj: cnpj ?? undefined,
              telefone: pick(row, 'telefone'),
              endereco_completo: pick(row, 'endereco_completo', 'endereço_completo', 'endereco', 'endereço'),
            },
          };
        },
      }),
    );
  }
}
