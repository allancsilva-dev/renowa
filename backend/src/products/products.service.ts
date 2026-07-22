import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import * as XLSX from 'xlsx';
import { Product } from './entities/product.entity';
import { money } from '../common/decimal/decimal';
import { CreateProductDto } from './dto/create-product.dto';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';
import { ImportProductsResultDto, ImportProductRowError } from './dto/import-products-result.dto';

const IMPORT_MAX_ROWS = 5000;
const IMPORT_ALLOWED_EXTENSIONS = ['csv', 'xlsx'];

interface ImportedRow {
  codigo?: string;
  descricao?: string;
  preco_base?: string;
}

function normalizeImportRow(row: Record<string, unknown>): ImportedRow {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key.trim().toLowerCase()] = value;
  }
  const toTrimmedString = (value: unknown): string | undefined =>
    value === undefined || value === null || value === '' ? undefined : String(value).trim();

  return {
    codigo: toTrimmedString(normalized['codigo']),
    descricao: toTrimmedString(normalized['descricao'] ?? normalized['descrição']),
    preco_base: toTrimmedString(
      normalized['preco_base'] ?? normalized['preço_base'] ?? normalized['preco'] ?? normalized['preço'],
    ),
  };
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateProductDto, tenantId: string): Promise<Product> {
    // Fornecedor é obrigatório na CRIAÇÃO (não no DTO — update de produto
    // legado sem fornecedor continua permitido via PartialType).
    if (!dto.fornecedor_uuid) {
      throw new BadRequestException('Fornecedor é obrigatório para criar um produto.');
    }
    const rows = await this.dataSource.query(
      `SELECT id FROM fornecedores WHERE uuid = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [dto.fornecedor_uuid, tenantId],
    ) as Array<{ id: number }>;
    if (!rows[0]) throw new NotFoundException('Fornecedor não encontrado.');
    const fornecedor_id = rows[0].id;

    const { fornecedor_uuid: _f, uuid, ...rest } = dto;
    const product = this.productRepo.create({
      ...rest,
      preco_base: rest.preco_base === undefined ? null : money(rest.preco_base),
      uuid,
      fornecedor_id,
      tenant_id: tenantId,
    });
    return this.productRepo.save(product);
  }

  async findAll(
    tenantId: string,
    pagination: PaginationDto,
    search?: string,
    fornecedorUuid?: string,
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

    if (fornecedorUuid) qb.andWhere('f.uuid = :fornecedorUuid', { fornecedorUuid });

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
    const { fornecedor_uuid: _f, uuid: _u, preco_base, ...rest } = dto;
    Object.assign(product, rest);
    if (preco_base !== undefined) product.preco_base = money(preco_base);
    if (Object.prototype.hasOwnProperty.call(dto, 'fornecedor_uuid')) {
      if (!dto.fornecedor_uuid) {
        product.fornecedor_id = null;
      } else {
        const rows = await this.dataSource.query(
          `SELECT id FROM fornecedores WHERE uuid = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
          [dto.fornecedor_uuid, tenantId],
        ) as Array<{ id: number }>;
        if (!rows[0]) throw new NotFoundException('Fornecedor não encontrado.');
        product.fornecedor_id = rows[0].id;
      }
    }
    return this.productRepo.save(product);
  }

  async remove(uuid: string, tenantId: string): Promise<void> {
    const product = await this.findOne(uuid, tenantId);
    await this.productRepo.softDelete(product.id);
  }

  /**
   * Importação em massa (.csv/.xlsx). Falhas ESTRUTURAIS (arquivo grande
   * demais, tipo inválido, fornecedor inexistente) lançam exceção. Erros
   * POR LINHA nunca interrompem o processamento — só são acumulados em
   * `erros` e contam para `rejeitados`.
   */
  async importFromFile(
    file: Express.Multer.File | undefined,
    fornecedorUuid: string | undefined,
    tenantId: string,
  ): Promise<ImportProductsResultDto> {
    if (!file) throw new BadRequestException('Arquivo obrigatório.');
    if (!fornecedorUuid) throw new BadRequestException('Fornecedor é obrigatório para importação.');

    const extension = (file.originalname.split('.').pop() ?? '').toLowerCase();
    if (!IMPORT_ALLOWED_EXTENSIONS.includes(extension)) {
      throw new BadRequestException('Tipo de arquivo inválido. Utilize .csv ou .xlsx.');
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(file.buffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException('Não foi possível ler o arquivo enviado.');
    }
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new BadRequestException('Arquivo não contém planilhas.');
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: null });

    if (rows.length > IMPORT_MAX_ROWS) {
      throw new BadRequestException(`Arquivo excede o limite de ${IMPORT_MAX_ROWS} linhas.`);
    }

    return this.dataSource.transaction(async (manager) => {
      const fornecedorRows = await manager.query(
        `SELECT id FROM fornecedores WHERE uuid = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [fornecedorUuid, tenantId],
      ) as Array<{ id: number }>;
      if (!fornecedorRows[0]) throw new NotFoundException('Fornecedor não encontrado.');
      const fornecedorId = fornecedorRows[0].id;

      const productRepo = manager.getRepository(Product);
      const seen = new Set<string>();
      const erros: ImportProductRowError[] = [];
      let criados = 0;
      let atualizados = 0;
      let rejeitados = 0;

      for (const [index, rawRow] of rows.entries()) {
        const linha = index + 2; // linha 1 = cabeçalho
        const { codigo, descricao, preco_base } = normalizeImportRow(rawRow);

        if (!codigo) {
          erros.push({ linha, codigo: '', erro: 'Código é obrigatório.' });
          rejeitados++;
          continue;
        }
        if (seen.has(codigo)) {
          erros.push({ linha, codigo, erro: 'Código duplicado no arquivo.' });
          rejeitados++;
          continue;
        }
        seen.add(codigo);

        if (!descricao) {
          erros.push({ linha, codigo, erro: 'Descrição é obrigatória.' });
          rejeitados++;
          continue;
        }

        let precoValue: string | null = null;
        if (preco_base !== undefined) {
          const parsed = Number(preco_base.replace(',', '.'));
          if (Number.isNaN(parsed)) {
            erros.push({ linha, codigo, erro: 'Preço base inválido.' });
            rejeitados++;
            continue;
          }
          precoValue = money(parsed);
        }

        const existing = await productRepo.findOne({
          where: { codigo, fornecedor_id: fornecedorId, tenant_id: tenantId, deleted_at: IsNull() },
        });

        if (existing) {
          existing.descricao = descricao;
          if (precoValue !== null) existing.preco_base = precoValue;
          await productRepo.save(existing);
          atualizados++;
        } else {
          const created = productRepo.create({
            uuid: randomUUID(),
            tenant_id: tenantId,
            fornecedor_id: fornecedorId,
            codigo,
            descricao,
            preco_base: precoValue,
          });
          await productRepo.save(created);
          criados++;
        }
      }

      return { criados, atualizados, rejeitados, erros };
    });
  }
}
