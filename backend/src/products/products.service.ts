import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import * as Papa from 'papaparse';
import { Product } from './entities/product.entity';
import { money } from '../common/decimal/decimal';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';
import { ImportProductsResultDto, ImportProductRowError } from './dto/import-products-result.dto';

const IMPORT_MAX_ROWS = 5000;
const IMPORT_ALLOWED_EXTENSIONS = ['csv'];
const UTF8_BOM = [0xef, 0xbb, 0xbf];

interface ImportedRow {
  codigo?: string;
  descricao?: string;
  preco_base?: string;
}

/**
 * Excel pt-BR gera CSV em dois formatos incompatíveis entre si:
 * - "CSV UTF-8": UTF-8 COM BOM (o BOM entraria no nome da 1ª coluna).
 * - "CSV (separado por vírgulas)": Windows-1252, onde "Descrição" não é
 *   UTF-8 válido e viraria mojibake se decodificado como UTF-8.
 * Decodifica em UTF-8 estrito e só cai para Windows-1252 quando o buffer
 * comprovadamente não é UTF-8 — assim arquivo UTF-8 legítimo nunca é
 * reinterpretado por engano.
 */
function decodeCsvBuffer(buffer: Buffer): string {
  const hasBom = buffer.length >= 3 && UTF8_BOM.every((byte, i) => buffer[i] === byte);
  const body = hasBom ? buffer.subarray(UTF8_BOM.length) : buffer;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    return new TextDecoder('windows-1252').decode(body);
  }
}

// Agrupamento de milhar válido: "1.234", "1.234.567". Ancorado nas duas
// pontas e sem quantificador aninhado ambíguo — linear, sem risco de ReDoS.
const THOUSANDS_GROUPED = { '.': /^-?\d{1,3}(\.\d{3})+$/, ',': /^-?\d{1,3}(,\d{3})+$/ } as const;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * Converte preço em formato pt-BR ou en-US para número.
 * O parse anterior (`Number(valor.replace(',', '.'))`) trocava apenas a
 * PRIMEIRA vírgula: "1.234,56" (saída padrão do Excel pt-BR) virava
 * "1.234.56" => NaN, rejeitando toda linha com preço acima de mil.
 * Regra: havendo os dois separadores, o mais à direita é o decimal e o
 * outro é separador de milhar. Retorna NaN para qualquer entrada que não
 * seja estritamente numérica após a normalização.
 */
function parseImportPrice(raw: string): number {
  const cleaned = raw.replace(/\s/g, '').replace(/^R\$/i, '');
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized: string;

  if (lastComma >= 0 && lastDot >= 0) {
    // Ambos presentes: o separador mais à direita é o decimal.
    const decimalAt = Math.max(lastComma, lastDot);
    const thousandSep = lastComma > lastDot ? '.' : ',';
    const integerPart = cleaned.slice(0, decimalAt);
    const fractionPart = cleaned.slice(decimalAt + 1);
    if (!THOUSANDS_GROUPED[thousandSep].test(integerPart) || !/^\d+$/.test(fractionPart)) {
      return Number.NaN;
    }
    normalized = `${integerPart.split(thousandSep).join('')}.${fractionPart}`;
  } else if (lastComma >= 0) {
    // Vírgula única = decimal pt-BR ("12,50"). Várias só podem ser milhar
    // ("1,234,567") — e só valem se o agrupamento for de 3 em 3 dígitos.
    if (cleaned.indexOf(',') === lastComma) {
      normalized = cleaned.replace(',', '.');
    } else if (THOUSANDS_GROUPED[','].test(cleaned)) {
      normalized = cleaned.split(',').join('');
    } else {
      return Number.NaN;
    }
  } else if (lastDot >= 0 && cleaned.indexOf('.') !== lastDot) {
    // Vários pontos ("1.234.567") só podem ser separador de milhar.
    if (!THOUSANDS_GROUPED['.'].test(cleaned)) return Number.NaN;
    normalized = cleaned.split('.').join('');
  } else {
    // Ponto único ("1234.56"/"1.234") ou só dígitos: comportamento existente.
    normalized = cleaned;
  }

  return PLAIN_NUMBER.test(normalized) ? Number(normalized) : Number.NaN;
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
      ipi_perc: rest.ipi_perc === undefined ? null : money(rest.ipi_perc),
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

  async update(uuid: string, dto: UpdateProductDto, tenantId: string): Promise<Product> {
    const product = await this.findOne(uuid, tenantId);
    const { fornecedor_uuid: _f, uuid: _u, preco_base, ipi_perc, ...rest } = dto;
    Object.assign(product, rest);
    if (preco_base !== undefined) product.preco_base = money(preco_base);
    if (ipi_perc !== undefined) product.ipi_perc = money(ipi_perc);
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
   * Importação em massa (.csv). Falhas ESTRUTURAIS (arquivo grande demais,
   * tipo inválido, fornecedor inexistente) lançam exceção. Erros POR LINHA
   * nunca interrompem o processamento — só são acumulados em `erros` e
   * contam para `rejeitados`.
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
      throw new BadRequestException('Tipo de arquivo inválido. Utilize .csv (UTF-8).');
    }

    let rows: Record<string, unknown>[];
    try {
      const parsed = Papa.parse<Record<string, unknown>>(decodeCsvBuffer(file.buffer), {
        header: true,
        // Auto-detecção: Excel pt-BR salva CSV com ';' em vez de ','.
        delimiter: '',
        skipEmptyLines: 'greedy',
        transformHeader: (header) => header.trim(),
        // Limita DURANTE o parse: o array de linhas nunca passa de
        // IMPORT_MAX_ROWS + 1, que é o suficiente para detectar o excesso
        // logo abaixo sem materializar o arquivo inteiro.
        preview: IMPORT_MAX_ROWS + 1,
      });
      rows = parsed.data;
    } catch {
      throw new BadRequestException('Não foi possível ler o arquivo enviado.');
    }

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
          const parsed = parseImportPrice(preco_base);
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
