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

  /**
   * `chamadoId` é `null` na criação: o cabeçalho ainda não existe, e quem chama
   * preenche a FK depois de gravá-lo. O total só depende dos valores calculados,
   * então dá para conhecê-lo antes do primeiro `save`.
   */
  private async buildItem(
    manager: EntityManager,
    dto: CreateSacTicketItemDto,
    tenantId: string,
    chamadoId: number | null,
  ): Promise<Partial<SacTicketItem>> {
    const calculated = calculateSacItem(dto);
    return {
      uuid: dto.uuid,
      tenant_id: tenantId,
      chamado_id: chamadoId ?? undefined,
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

  /**
   * O uuid do chamado e dos itens vem do cliente. Duplo clique em "Salvar" ou
   * retry de rede reenvia os mesmos uuids: sem esta guarda o INSERT morre no
   * índice único e o usuário recebe erro de banco em vez de recusa de negócio.
   */
  private async assertUuidsLivres(
    manager: EntityManager,
    uuidChamado: string,
    uuidsItens: readonly string[],
  ): Promise<void> {
    const chamados = await manager.query(
      'SELECT 1 FROM chamados_sac WHERE uuid = $1 LIMIT 1',
      [uuidChamado],
    ) as unknown[];
    if (chamados.length) throw new ConflictException(`Chamado ${uuidChamado} já cadastrado.`);

    if (!uuidsItens.length) return;
    const itens = await manager.query(
      'SELECT uuid FROM itens_chamado_sac WHERE uuid = ANY($1) LIMIT 1',
      [[...uuidsItens]],
    ) as Array<{ uuid: string }>;
    if (itens.length) {
      throw new ConflictException(`Item ${itens[0].uuid} já cadastrado em outro chamado.`);
    }
  }

  /**
   * Emite o próximo número do chamado **do tenant**, em uma instrução atômica que
   * trava só a linha do próprio tenant. Uma sequence global (o mecanismo anterior)
   * é compartilhada entre tenants: o tenant A enxergava #1, #4, #9, e os buracos
   * revelavam o volume de chamados dos outros. `nextval` não serve aqui porque não
   * existe sequence por tenant sem DDL dinâmico.
   */
  private async proximoNumero(manager: EntityManager, tenantId: string): Promise<number> {
    const rows = await manager.query(
      `INSERT INTO sac_numero_contador (tenant_id, ultimo) VALUES ($1, 1)
         ON CONFLICT (tenant_id) DO UPDATE SET ultimo = sac_numero_contador.ultimo + 1
       RETURNING ultimo`,
      [tenantId],
    ) as Array<{ ultimo: number }>;
    return rows[0].ultimo;
  }

  async create(dto: CreateSacTicketDto, user: RequestUser): Promise<SacTicket> {
    const uuid = await this.dataSource.transaction(async (manager) => {
      await this.assertUuidsLivres(manager, dto.uuid, dto.itens.map((item) => item.uuid));
      const cliente_id = await this.resolveUuid(manager, 'clientes', dto.cliente_uuid, user.tenantId, true);
      const fornecedor_id = await this.resolveUuid(manager, 'fornecedores', dto.fornecedor_uuid, user.tenantId, true);
      const numero = await this.proximoNumero(manager, user.tenantId);

      // Itens calculados ANTES de gravar o cabeçalho: `buildItem` só precisa do
      // `chamado_id` para a FK, então o total já é conhecido no primeiro `save` e
      // o chamado nasce com `version = 1`. Salvar duas vezes fazia todo chamado
      // recém-criado nascer com `version = 2`.
      const items = await Promise.all(dto.itens.map((item) =>
        this.buildItem(manager, item, user.tenantId, null),
      ));

      const chamado = manager.create(SacTicket, {
        uuid: dto.uuid,
        tenant_id: user.tenantId,
        numero_chamado: numero,
        cliente_id: cliente_id!,
        fornecedor_id: fornecedor_id!,
        numero_nfe: dto.numero_nfe ?? null,
        data: dto.data ?? null,
        // Todo chamado nasce 'aberto'. Transição é endpoint dedicado.
        status: 'aberto',
        observacao: dto.observacao ?? null,
        total: this.totalFromItems(items),
      });
      const saved = await manager.save(chamado);

      await manager.save(items.map((item) => manager.create(SacTicketItem, {
        ...item,
        chamado_id: saved.id,
      })));
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

      // Um uuid de item que já existe em outro chamado (ou tenant) seria
      // sequestrado pelo upsert abaixo — mesma guarda de OrdersService. Uma query
      // só para o lote: era um SELECT por item dentro da transação que já mantém
      // `pessimistic_write` no chamado, e 50 itens viravam 50 idas ao banco com o
      // lock aberto.
      if (dto.itens.length) {
        const invasores = await manager.query(
          `SELECT uuid FROM itens_chamado_sac
            WHERE uuid = ANY($1) AND (tenant_id <> $2 OR chamado_id <> $3) LIMIT 1`,
          [dto.itens.map((item) => item.uuid), user.tenantId, chamado.id],
        ) as Array<{ uuid: string }>;
        if (invasores[0]) {
          throw new BadRequestException('UUID de item já pertence a outro chamado ou tenant.');
        }
      }

      for (const itemDto of dto.itens) {
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
    // Status inválido devolvia 200 com lista vazia — indistinguível de "não há
    // chamados". Mesma disciplina de `updateStatus`.
    if (status) {
      if (!(SAC_STATUSES as readonly string[]).includes(status)) {
        throw new BadRequestException(`Status inválido. Use um de: ${SAC_STATUSES.join(', ')}.`);
      }
      qb.andWhere('c.status = :status', { status });
    }
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
