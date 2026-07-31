import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Product } from './entities/product.entity';
import { money } from '../common/decimal/decimal';
import { createIdempotente } from '../common/persistence/idempotent-create';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';
import { ImportProductsResultDto, ImportProductRowError } from './dto/import-products-result.dto';
import { parseCsvRows, normalizeRowKeys, pick } from '../common/csv/csv-import.util';
import { ProductPhotosService } from './product-photos.service';

const IMPORT_MAX_ROWS = 5000;

interface ImportedRow {
  codigo?: string;
  descricao?: string;
  preco_base?: string;
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
  const normalized = normalizeRowKeys(row);
  return {
    codigo: normalized['codigo'],
    descricao: pick(normalized, 'descricao', 'descrição'),
    preco_base: pick(normalized, 'preco_base', 'preço_base', 'preco', 'preço'),
  };
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly dataSource: DataSource,
    private readonly photosService: ProductPhotosService,
  ) {}

  private async resolveFornecedorId(
    manager: EntityManager,
    fornecedorUuid: string,
    tenantId: string,
  ): Promise<number> {
    const rows = await manager.query(
      `SELECT id FROM fornecedores WHERE uuid = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [fornecedorUuid, tenantId],
    ) as Array<{ id: number }>;
    if (!rows[0]) throw new NotFoundException('Fornecedor não encontrado.');
    return rows[0].id;
  }

  /**
   * Código é a chave natural do catálogo DO FORNECEDOR: a importação em massa
   * sempre a usou para decidir entre criar e atualizar, e o cadastro manual
   * ignorava. Espelha `uq_produtos_codigo` (0041) — a guarda dá a mensagem de
   * negócio, o índice garante sob concorrência (duas abas, duas requisições ou
   * dois dispositivos sincronizando ao mesmo tempo não passam pela guarda).
   *
   * Produto sem código e produto sem fornecedor ficam de fora, como no índice.
   */
  private async assertCodigoLivre(
    manager: EntityManager,
    tenantId: string,
    fornecedorId: number | null,
    codigo: string | null | undefined,
    ignorarProdutoId: number | null,
  ): Promise<void> {
    if (!codigo || fornecedorId == null) return;
    const rows = await manager.query(
      `SELECT descricao FROM produtos
        WHERE tenant_id = $1 AND fornecedor_id = $2 AND codigo = $3
          AND deleted_at IS NULL AND ($4::int IS NULL OR id <> $4)
        LIMIT 1`,
      [tenantId, fornecedorId, codigo, ignorarProdutoId],
    ) as Array<{ descricao: string }>;
    if (rows.length) {
      throw new ConflictException(
        `Código ${codigo} já cadastrado para este fornecedor no produto "${rows[0].descricao}".`,
      );
    }
  }

  /**
   * O uuid vem do cliente e é a chave de idempotência: reenviar a MESMA criação
   * (duplo clique, retry de rede, fila offline que perdeu a resposta) devolve o
   * produto que já existe em vez de criar um segundo. Ver `createIdempotente`.
   */
  async create(dto: CreateProductDto, tenantId: string): Promise<Product> {
    // Fornecedor é obrigatório na CRIAÇÃO (não no DTO — update de produto
    // legado sem fornecedor continua permitido via PartialType).
    if (!dto.fornecedor_uuid) {
      throw new BadRequestException('Fornecedor é obrigatório para criar um produto.');
    }

    return this.dataSource.transaction(async (manager) => {
      const fornecedor_id = await this.resolveFornecedorId(manager, dto.fornecedor_uuid!, tenantId);
      const { fornecedor_uuid: _f, uuid, ...rest } = dto;

      return createIdempotente({
        repository: this.productRepo,
        manager,
        uuid,
        tenantId,
        build: () => ({
          ...rest,
          preco_base: rest.preco_base === undefined ? null : money(rest.preco_base),
          ipi_perc: rest.ipi_perc === undefined ? null : money(rest.ipi_perc),
          uuid,
          fornecedor_id,
          tenant_id: tenantId,
        }),
        // Só corre quando a criação é de fato nova: replay do mesmo uuid não
        // pode ser recusado por colidir com o próprio registro que ele replica.
        antesDeInserir: () => this.assertCodigoLivre(
          manager, tenantId, fornecedor_id, rest.codigo, null,
        ),
      });
    });
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

    return this.dataSource.transaction(async (manager) => {
      if (Object.prototype.hasOwnProperty.call(dto, 'fornecedor_uuid')) {
        product.fornecedor_id = dto.fornecedor_uuid
          ? await this.resolveFornecedorId(manager, dto.fornecedor_uuid, tenantId)
          : null;
      }
      // Trocar o código, ou mover o produto para outro fornecedor, esbarra na
      // mesma chave natural da criação — e antes disto não esbarrava em nada.
      await this.assertCodigoLivre(
        manager, tenantId, product.fornecedor_id, product.codigo, product.id,
      );
      return manager.getRepository(Product).save(product);
    });
  }

  /**
   * As duas escritas correm na MESMA transação. Antes não corriam: a purga
   * abria e commitava a própria, e só então vinha o soft delete. Um erro de
   * conexão entre as duas deixava os bytes zerados (`purgado`, irreversível)
   * com o produto vivo — foto destruída de um produto que ainda existe, sem
   * como recuperar. Janela estreita, perda permanente.
   */
  async remove(uuid: string, tenantId: string): Promise<void> {
    const product = await this.findOne(uuid, tenantId);
    await this.dataSource.transaction(async (manager) => {
      // A foto vai junto: o índice único parcial `uq_produto_fotos_produto` (0040)
      // guardaria a vaga de um produto que não existe mais, e a imagem continuaria
      // servível por qualquer pedido antigo que ainda referencie o produto.
      await this.photosService.removeByProductId(product.id, tenantId, manager);
      await manager.getRepository(Product).softDelete(product.id);
    });
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
    if (!fornecedorUuid) throw new BadRequestException('Fornecedor é obrigatório para importação.');

    const rows = parseCsvRows(file, IMPORT_MAX_ROWS);

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
