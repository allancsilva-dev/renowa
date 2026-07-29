import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { SacTicket } from './entities/sac-ticket.entity';
import { SacTicketItem } from './entities/sac-ticket-item.entity';
import { CreateSacTicketDto, CreateSacTicketItemDto, UpdateSacTicketDto } from './dto/create-sac-ticket.dto';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';
import { RequestUser } from '../common/types/jwt-payload.type';
import { optimisticSoftDelete, optimisticUpdate } from '../common/persistence/optimistic-concurrency';
import { ConcurrentModificationException } from '../common/errors/concurrent-modification.exception';
import { calculateSacItem, calculateSacTotal } from './sac-calculation';

export const SAC_STATUSES = ['aberto', 'em_andamento', 'resolvido', 'cancelado'] as const;
export type SacStatus = (typeof SAC_STATUSES)[number];

/**
 * Transições permitidas. Um chamado resolvido ou cancelado é terminal: reabrir
 * exige abrir outro chamado, senão o histórico de atendimento fica ambíguo.
 */
const TRANSICOES: Record<SacStatus, readonly SacStatus[]> = {
  aberto: ['em_andamento', 'resolvido', 'cancelado'],
  em_andamento: ['resolvido', 'cancelado'],
  resolvido: [],
  cancelado: [],
};

/** Status a partir dos quais o conteúdo do chamado ainda pode ser editado. */
const EDITAVEL: readonly string[] = ['aberto', 'em_andamento'];

@Injectable()
export class SacService {
  constructor(
    @InjectRepository(SacTicket) private readonly ticketRepo: Repository<SacTicket>,
    private readonly dataSource: DataSource,
  ) {}

  private async resolveUuid(
    manager: EntityManager,
    table: 'clientes' | 'fornecedores' | 'produtos',
    uuid: string | null | undefined,
    tenantId: string,
    required = false,
  ): Promise<number | null> {
    if (!uuid) {
      if (required) throw new BadRequestException(`Referência obrigatória ausente: ${table}.`);
      return null;
    }
    const rows = await manager.query(
      `SELECT id FROM ${table} WHERE uuid = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [uuid, tenantId],
    ) as Array<{ id: number }>;
    if (!rows[0]) throw new BadRequestException(`Referência inválida ou fora do tenant: ${table}.`);
    return rows[0].id;
  }

  private async buildItem(
    manager: EntityManager,
    dto: CreateSacTicketItemDto,
    tenantId: string,
    chamadoId: number,
  ): Promise<Partial<SacTicketItem>> {
    const calculated = calculateSacItem(dto);
    return {
      uuid: dto.uuid,
      tenant_id: tenantId,
      chamado_id: chamadoId,
      produto_id: await this.resolveUuid(manager, 'produtos', dto.produto_uuid, tenantId),
      codigo: dto.codigo.trim(),
      motivo: dto.motivo.trim(),
      quantidade: calculated.quantidade,
      valor_unitario: calculated.valor_unitario,
      valor_total: calculated.valor_total,
    };
  }

  private totalFromItems(items: Array<Partial<SacTicketItem>>): string {
    return calculateSacTotal(items.map((item) => ({
      quantidade: item.quantidade!,
      valor_unitario: item.valor_unitario!,
      valor_total: item.valor_total!,
    })));
  }

  async create(dto: CreateSacTicketDto, user: RequestUser): Promise<SacTicket> {
    const uuid = await this.dataSource.transaction(async (manager) => {
      const cliente_id = await this.resolveUuid(manager, 'clientes', dto.cliente_uuid, user.tenantId, true);
      const fornecedor_id = await this.resolveUuid(manager, 'fornecedores', dto.fornecedor_uuid, user.tenantId, true);
      const sequence = await manager.query(`SELECT nextval('sac_numero_seq')::int AS numero`) as Array<{ numero: number }>;

      const chamado = manager.create(SacTicket, {
        uuid: dto.uuid,
        tenant_id: user.tenantId,
        numero_chamado: sequence[0].numero,
        cliente_id: cliente_id!,
        fornecedor_id: fornecedor_id!,
        numero_nfe: dto.numero_nfe ?? null,
        data: dto.data ?? null,
        // Todo chamado nasce 'aberto'. Transição é endpoint dedicado.
        status: 'aberto',
        observacao: dto.observacao ?? null,
      });
      const saved = await manager.save(chamado);

      const items = await Promise.all(dto.itens.map((item) =>
        this.buildItem(manager, item, user.tenantId, saved.id),
      ));
      await manager.save(items.map((item) => manager.create(SacTicketItem, item)));
      saved.total = this.totalFromItems(items);
      await manager.save(saved);
      return saved.uuid;
    });
    return this.findOne(uuid, user);
  }

  async update(uuid: string, dto: UpdateSacTicketDto, user: RequestUser): Promise<SacTicket> {
    await this.dataSource.transaction(async (manager) => {
      const ticketRepo = manager.getRepository(SacTicket);
      const itemRepo = manager.getRepository(SacTicketItem);
      const chamado = await ticketRepo.findOne({
        where: { uuid, tenant_id: user.tenantId, deleted_at: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!chamado) throw new NotFoundException(`Chamado ${uuid} não encontrado.`);
      if (chamado.version !== dto.version) {
        throw new ConcurrentModificationException('sac-ticket', uuid, dto.version, chamado.version);
      }
      if (!EDITAVEL.includes(chamado.status)) {
        throw new ConflictException(`Chamado ${uuid} não pode ser editado pois já está ${chamado.status}.`);
      }

      const cliente_id = await this.resolveUuid(manager, 'clientes', dto.cliente_uuid, user.tenantId, true);
      const fornecedor_id = await this.resolveUuid(manager, 'fornecedores', dto.fornecedor_uuid, user.tenantId, true);

      const existingItems = await itemRepo.find({
        withDeleted: true,
        where: { chamado_id: chamado.id, tenant_id: user.tenantId },
      });
      const byUuid = new Map(existingItems.map((item) => [item.uuid, item]));
      const requested = new Set(dto.itens.map((item) => item.uuid));
      const calculatedItems: Array<Partial<SacTicketItem>> = [];

      for (const itemDto of dto.itens) {
        // Um uuid de item que já existe em outro chamado (ou tenant) seria
        // sequestrado pelo upsert abaixo — mesma guarda de OrdersService.
        const collisions = await manager.query(
          'SELECT tenant_id, chamado_id FROM itens_chamado_sac WHERE uuid = $1 LIMIT 1',
          [itemDto.uuid],
        ) as Array<{ tenant_id: string; chamado_id: number }>;
        if (collisions[0] && (collisions[0].tenant_id !== user.tenantId || collisions[0].chamado_id !== chamado.id)) {
          throw new BadRequestException('UUID de item já pertence a outro chamado ou tenant.');
        }

        const values = await this.buildItem(manager, itemDto, user.tenantId, chamado.id);
        calculatedItems.push(values);
        const existing = byUuid.get(itemDto.uuid);
        if (existing) {
          Object.assign(existing, values, { deleted_at: null });
          await itemRepo.save(existing);
        } else {
          await itemRepo.save(itemRepo.create(values));
        }
      }

      const omitted = existingItems.filter((item) => !item.deleted_at && !requested.has(item.uuid));
      if (omitted.length) await itemRepo.softRemove(omitted);

      // `status` não é tocado aqui: transição tem endpoint próprio.
      Object.assign(chamado, {
        cliente_id,
        fornecedor_id,
        numero_nfe: dto.numero_nfe ?? null,
        data: dto.data ?? null,
        observacao: dto.observacao ?? null,
        total: this.totalFromItems(calculatedItems),
      });
      await ticketRepo.save(chamado);
    });
    return this.findOne(uuid, user);
  }

  async findAll(
    tenantId: string,
    pagination: PaginationDto,
    status?: string,
    search?: string,
  ): Promise<PaginatedResponse<SacTicket>> {
    const { page = 1, limit = 20 } = pagination;
    const qb = this.ticketRepo.createQueryBuilder('c')
      .leftJoinAndSelect('c.cliente', 'cliente')
      .leftJoinAndSelect('c.fornecedor', 'fornecedor')
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere('c.deleted_at IS NULL');
    if (status) qb.andWhere('c.status = :status', { status });
    if (search) {
      qb.andWhere(
        '(CAST(c.numero_chamado AS TEXT) ILIKE :search OR c.numero_nfe ILIKE :search'
        + ' OR cliente.razao_social ILIKE :search OR cliente.cnpj ILIKE :search)',
        { search: `%${search}%` },
      );
    }
    const [data, total] = await qb.orderBy('c.created_at', 'DESC')
      .skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(uuid: string, user: RequestUser): Promise<SacTicket> {
    const chamado = await this.ticketRepo.createQueryBuilder('c')
      .leftJoinAndSelect('c.cliente', 'cliente')
      .leftJoinAndSelect('c.fornecedor', 'fornecedor')
      .leftJoinAndSelect('c.itens', 'itens', 'itens.deleted_at IS NULL')
      .leftJoinAndSelect('itens.produto', 'produto')
      .where('c.uuid = :uuid', { uuid })
      .andWhere('c.tenant_id = :tenantId', { tenantId: user.tenantId })
      .andWhere('c.deleted_at IS NULL')
      .getOne();
    if (!chamado) throw new NotFoundException(`Chamado ${uuid} não encontrado.`);
    return chamado;
  }

  async updateStatus(uuid: string, status: string, version: number, user: RequestUser): Promise<SacTicket> {
    if (!(SAC_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException(`Status inválido. Use um de: ${SAC_STATUSES.join(', ')}.`);
    }

    const chamado = await this.findOne(uuid, user);
    const permitidos = TRANSICOES[chamado.status as SacStatus] ?? [];
    if (!permitidos.includes(status as SacStatus)) {
      throw new ConflictException(
        `Transição inválida: chamado está '${chamado.status}' e não pode ir para '${status}'.`,
      );
    }

    await optimisticUpdate({
      repository: this.ticketRepo, uuid, tenantId: user.tenantId,
      expectedVersion: version, resource: 'sac-ticket',
      notFoundMessage: `Chamado ${uuid} não encontrado.`, patch: { status },
    });
    return this.findOne(uuid, user);
  }

  /**
   * BACKLOG-0055: excluído o chamado, `itens_chamado_sac` ficava com
   * `deleted_at IS NULL`. As FKs são `NO ACTION` e `optimisticSoftDelete` marca
   * UMA linha, então o ocultamento dos itens dependia de cada query lembrar do
   * filtro — a primeira que esquecesse ressuscitava item de chamado excluído.
   */
  async remove(uuid: string, version: number, user: RequestUser): Promise<void> {
    const chamado = await this.findOne(uuid, user);

    await this.dataSource.transaction(async (manager) => {
      await optimisticSoftDelete({
        repository: manager.getRepository(SacTicket), uuid, tenantId: user.tenantId,
        expectedVersion: version, resource: 'sac-ticket',
        notFoundMessage: `Chamado ${uuid} não encontrado.`,
      });

      // Depois do pai: conflito de `version` aborta a transação e os itens não
      // ficam marcados sem o chamado.
      await manager.query(
        `UPDATE itens_chamado_sac SET deleted_at = CURRENT_TIMESTAMP, version = version + 1
          WHERE tenant_id = $1 AND chamado_id = $2 AND deleted_at IS NULL`,
        [user.tenantId, chamado.id],
      );
    });
  }
}
