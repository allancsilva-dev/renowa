import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Preposto } from './entities/preposto.entity';
import { CreatePrepostoDto } from './dto/create-preposto.dto';
import { UpdatePrepostoDto } from './dto/update-preposto.dto';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';
import { applySearch } from '../common/persistence/search-filter';
import { createIdempotente } from '../common/persistence/idempotent-create';
import { optimisticSoftDelete, optimisticUpdate } from '../common/persistence/optimistic-concurrency';
import { money } from '../common/decimal/decimal';

const DOCUMENTO_UNIQUE = 'uq_prepostos_tenant_documento_active';
const DOCUMENTO_DUPLICADO = 'Este CPF/CNPJ já existe no cadastro de prepostos.';

/** Pedidos que ainda podem gerar nota — o preposto deles não pode sumir do cadastro. */
const PEDIDO_EM_ANDAMENTO = ['em_aberto', 'liberado', 'parcialmente_faturado'];

function rethrowDocumentoDuplicado(error: unknown): never {
  const dbError = error as { code?: string; constraint?: string };
  if (dbError?.code === '23505' && dbError.constraint === DOCUMENTO_UNIQUE) {
    throw new ConflictException(DOCUMENTO_DUPLICADO);
  }
  throw error;
}

@Injectable()
export class PrepostosService {
  constructor(
    @InjectRepository(Preposto) private readonly prepostoRepo: Repository<Preposto>,
  ) {}

  async create(dto: CreatePrepostoDto, tenantId: string): Promise<Preposto> {
    const { uuid, ...rest } = dto;
    try {
      return await createIdempotente<Preposto>({
        repository: this.prepostoRepo,
        uuid,
        tenantId,
        build: () => ({
          ...rest,
          percentual_comissao: money(rest.percentual_comissao),
          uuid,
          tenant_id: tenantId,
        }),
        antesDeInserir: () => this.assertDocumentoLivre(rest.documento, tenantId),
      });
    } catch (error) {
      return rethrowDocumentoDuplicado(error);
    }
  }

  async findAll(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponse<Preposto>> {
    const { page = 1, limit = 20 } = pagination;
    const qb = this.prepostoRepo.createQueryBuilder('p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.deleted_at IS NULL');
    applySearch(qb, pagination.search, {
      text: ['p.nome', "COALESCE(p.email, '')", "COALESCE(p.telefone, '')"],
      cnpj: ["COALESCE(p.documento, '')"],
    });

    const [data, total] = await qb
      .orderBy('p.nome', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(uuid: string, tenantId: string): Promise<Preposto> {
    const preposto = await this.prepostoRepo.findOne({ where: { uuid, tenant_id: tenantId } });
    if (!preposto) throw new NotFoundException(`Preposto ${uuid} não encontrado.`);
    return preposto;
  }

  async update(uuid: string, dto: UpdatePrepostoDto, tenantId: string): Promise<Preposto> {
    const { version, ...patch } = dto;
    if (Object.prototype.hasOwnProperty.call(patch, 'documento')) {
      await this.assertDocumentoLivre(patch.documento, tenantId, uuid);
    }
    const values: Partial<Preposto> = { ...patch } as Partial<Preposto>;
    if (patch.percentual_comissao !== undefined) values.percentual_comissao = money(patch.percentual_comissao);
    try {
      return await optimisticUpdate({
        repository: this.prepostoRepo,
        uuid,
        tenantId,
        expectedVersion: version,
        resource: 'preposto',
        notFoundMessage: `Preposto ${uuid} não encontrado.`,
        patch: values,
      });
    } catch (error) {
      return rethrowDocumentoDuplicado(error);
    }
  }

  async remove(uuid: string, version: number, tenantId: string): Promise<void> {
    const preposto = await this.findOne(uuid, tenantId);
    await this.assertRemovivel(preposto);
    await optimisticSoftDelete({
      repository: this.prepostoRepo,
      uuid,
      tenantId,
      expectedVersion: version,
      resource: 'preposto',
      notFoundMessage: `Preposto ${uuid} não encontrado.`,
    });
  }

  /**
   * Excluir com pedido em andamento deixaria a nota futura sem preposto ativo
   * para receber a comissão; com comissão pendente, a dívida sumiria da tela.
   */
  private async assertRemovivel(preposto: Preposto): Promise<void> {
    const [pedidos] = await this.prepostoRepo.query(
      `SELECT COUNT(*)::int AS total FROM pedidos
        WHERE tenant_id = $1 AND preposto_id = $2 AND deleted_at IS NULL AND status = ANY($3)`,
      [preposto.tenant_id, preposto.id, PEDIDO_EM_ANDAMENTO],
    ) as Array<{ total: number }>;
    if (pedidos.total > 0) {
      throw new ConflictException('Preposto tem pedidos em andamento. Conclua ou troque o preposto desses pedidos antes de excluir.');
    }
    const [vendas] = await this.prepostoRepo.query(
      `SELECT COUNT(*)::int AS total FROM preposto_comissoes
        WHERE tenant_id = $1 AND preposto_id = $2 AND deleted_at IS NULL AND status = 'pendente'`,
      [preposto.tenant_id, preposto.id],
    ) as Array<{ total: number }>;
    if (vendas.total > 0) {
      throw new ConflictException('Preposto tem comissões pendentes. Pague ou ajuste as vendas antes de excluir.');
    }
  }

  private async assertDocumentoLivre(documento: string | null | undefined, tenantId: string, excludeUuid?: string): Promise<void> {
    if (!documento) return;
    const qb = this.prepostoRepo.createQueryBuilder('p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.deleted_at IS NULL')
      .andWhere('p.documento = :documento', { documento });
    if (excludeUuid) qb.andWhere('p.uuid <> :excludeUuid', { excludeUuid });
    if (await qb.getExists()) throw new ConflictException(DOCUMENTO_DUPLICADO);
  }
}
