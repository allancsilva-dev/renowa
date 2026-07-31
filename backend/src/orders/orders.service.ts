import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { Order, ORDER_ORIGENS, ORDER_STATUSES } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { NotaFiscal } from '../faturamento/entities/nota-fiscal.entity';
import { CreateOrderDto, CreateOrderItemDto, UpdateOrderDto } from './dto/create-order.dto';
import { CreateExternalOrderDto, UpdateExternalOrderDto } from './dto/create-external-order.dto';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';
import { RequestUser } from '../common/types/jwt-payload.type';
import { optimisticSoftDelete, optimisticUpdate } from '../common/persistence/optimistic-concurrency';
import { buildItemValues, countNotasAtivas, totalsFromItems } from './order-write';
import { ConcurrentModificationException } from '../common/errors/concurrent-modification.exception';
import { decimal, money } from '../common/decimal/decimal';
import { isVendorOnly, vendorOwnershipWhere } from './order-ownership';

type ReferenceTable = 'clientes' | 'usuarios' | 'fornecedores' | 'transportadoras' | 'produtos';

/** Referências de cabeçalho comuns ao pedido interno e ao externo. */
type OrderHeaderRefs = Pick<CreateOrderDto, 'cliente_uuid' | 'vendedor_uuid' | 'fornecedor_uuid' | 'transportadora_uuid'>;

/** Pedido com as notas fiscais emitidas — usado no detalhe do pedido (GET /pedidos/:uuid). */
export type OrderDetalhe = Order & {
  notas: NotaFiscal[];
  total_faturado: string;
  divergencia: string;
};

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly itemRepo: Repository<OrderItem>,
    @InjectRepository(NotaFiscal) private readonly notaRepo: Repository<NotaFiscal>,
    private readonly dataSource: DataSource,
  ) {}

  // Regra compartilhada com OrderItemPhotosService — ver `order-ownership.ts`.
  private isVendorOnly(user: RequestUser): boolean {
    return isVendorOnly(user);
  }

  private vendorOwnershipWhere(user: RequestUser): { sql: string; params: { sub: string; tenantId: string } } {
    return vendorOwnershipWhere(user);
  }

  private async resolveUuid(
    manager: EntityManager,
    table: ReferenceTable,
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

  private async resolveHeader(manager: EntityManager, dto: OrderHeaderRefs, user: RequestUser) {
    const tenantId = user.tenantId;
    const vendedorUuid = this.isVendorOnly(user) ? user.sub : dto.vendedor_uuid;
    return {
      cliente_id: await this.resolveUuid(manager, 'clientes', dto.cliente_uuid, tenantId, true),
      vendedor_id: await this.resolveUuid(manager, 'usuarios', vendedorUuid, tenantId, this.isVendorOnly(user)),
      fornecedor_id: await this.resolveUuid(manager, 'fornecedores', dto.fornecedor_uuid, tenantId, true),
      transportadora_id: await this.resolveUuid(manager, 'transportadoras', dto.transportadora_uuid, tenantId),
    };
  }

  /**
   * Derivação de item e totais vivem em `order-write.ts`, compartilhadas com o
   * push de sync — uma implementação só, para as duas portas não divergirem de
   * aritmética como divergiram até PROB-0065.
   */
  private async buildItem(
    manager: EntityManager,
    dto: CreateOrderItemDto,
    tenantId: string,
    orderId: number,
    supplierId: number,
  ): Promise<Partial<OrderItem>> {
    return buildItemValues(manager, dto, tenantId, orderId, supplierId);
  }

  private totalsFromItems(items: Array<Partial<OrderItem>>) {
    return totalsFromItems(items);
  }

  /**
   * O uuid do pedido vem do cliente. Duplo clique em "Salvar" ou retry de rede
   * reenvia o mesmo uuid: sem esta guarda o INSERT morre no índice único e o
   * usuário recebe erro de banco em vez de uma recusa de negócio. Não distingue
   * uuid de outro tenant de propósito — a resposta é a mesma nos dois casos.
   */
  private async assertUuidLivre(manager: EntityManager, uuid: string): Promise<void> {
    const rows = await manager.query(
      'SELECT 1 FROM pedidos WHERE uuid = $1 LIMIT 1',
      [uuid],
    ) as unknown[];
    if (rows.length) {
      throw new ConflictException(`Pedido ${uuid} já cadastrado.`);
    }
  }

  async create(dto: CreateOrderDto, user: RequestUser): Promise<Order> {
    const uuid = await this.dataSource.transaction(async (manager) => {
      await this.assertUuidLivre(manager, dto.uuid);
      const refs = await this.resolveHeader(manager, dto, user);
      const sequence = await manager.query(`SELECT nextval('pedidos_numero_seq')::int AS numero`) as Array<{ numero: number }>;
      const order = manager.create(Order, {
        uuid: dto.uuid,
        tenant_id: user.tenantId,
        numero_pedido: sequence[0].numero,
        ...refs,
        origem: 'interno',
        data: dto.data ?? null,
        // Todo pedido nasce 'em_aberto'. Liberação é endpoint dedicado.
        status: 'em_aberto',
        pgt: dto.pgt ?? null,
        prazo: dto.prazo ?? null,
        local_entrega: dto.local_entrega ?? null,
        observacao: dto.observacao ?? null,
        tipo_faturamento: dto.tipo_faturamento ?? null,
      });
      const saved = await manager.save(order);
      const items = await Promise.all(dto.itens.map((item) =>
        this.buildItem(manager, item, user.tenantId, saved.id, refs.fornecedor_id!),
      ));
      const totals = this.totalsFromItems(items);
      await manager.save(items.map((item) => manager.create(OrderItem, item)));
      saved.total_sem_imposto = totals.total_sem_imposto;
      saved.total_com_imposto = totals.total_com_imposto;
      await manager.save(saved);
      return saved.uuid;
    });
    return this.findOne(uuid, user);
  }

  /**
   * O mesmo pedido do sistema de origem não pode ser registrado duas vezes: cada
   * registro consome um `numero_pedido` novo e gera fila de faturamento e comissão
   * duplicadas. A chave é (tenant, fornecedor, número) — `sistema_origem` é texto
   * livre digitado ("SAP B1" / "SapB1") e não serve de chave; o mesmo número em
   * fornecedores distintos é legítimo. Espelha `uq_pedidos_externo_numero` (0038):
   * a guarda dá a mensagem de negócio, o índice garante sob concorrência.
   */
  private async assertNumeroExternoLivre(
    manager: EntityManager,
    tenantId: string,
    fornecedorId: number,
    numero: string,
    ignorarPedidoId: number | null,
  ): Promise<void> {
    const rows = await manager.query(
      `SELECT numero_pedido FROM pedidos
        WHERE tenant_id = $1 AND fornecedor_id = $2 AND numero_pedido_externo = $3
          AND origem = 'externo' AND deleted_at IS NULL AND ($4::int IS NULL OR id <> $4)
        LIMIT 1`,
      [tenantId, fornecedorId, numero, ignorarPedidoId],
    ) as Array<{ numero_pedido: number }>;
    if (rows.length) {
      throw new ConflictException(
        `Pedido externo ${numero} já registrado para este fornecedor no pedido ${rows[0].numero_pedido}.`,
      );
    }
  }

  /**
   * Pedido externo: digitado em sistema de terceiro, registrado aqui só com
   * fornecedor, cliente, número de origem, sistema e valor.
   *
   * Consome a MESMA `pedidos_numero_seq` do pedido interno (numeração única e
   * contínua) e grava `total_sem_imposto = total_com_imposto = valor`. É esse
   * total que faz o pedido externo atravessar o faturamento sem nenhuma
   * alteração no FaturamentoService — ele lê `total_com_imposto ??
   * total_sem_imposto` para montar a fila, a divergência e o recálculo de
   * status. Sem os dois totais preenchidos, o pedido entraria na fila com
   * divergência igual ao valor da nota.
   */
  async createExternal(dto: CreateExternalOrderDto, user: RequestUser): Promise<Order> {
    const uuid = await this.dataSource.transaction(async (manager) => {
      await this.assertUuidLivre(manager, dto.uuid);
      const refs = await this.resolveHeader(manager, dto, user);
      await this.assertNumeroExternoLivre(
        manager, user.tenantId, refs.fornecedor_id!, dto.numero_pedido_externo.trim(), null,
      );
      const sequence = await manager.query(`SELECT nextval('pedidos_numero_seq')::int AS numero`) as Array<{ numero: number }>;
      const valor = money(dto.valor);
      const order = manager.create(Order, {
        uuid: dto.uuid,
        tenant_id: user.tenantId,
        numero_pedido: sequence[0].numero,
        ...refs,
        origem: 'externo',
        numero_pedido_externo: dto.numero_pedido_externo.trim(),
        sistema_origem: dto.sistema_origem.trim(),
        data: dto.data ?? null,
        status: 'em_aberto',
        total_sem_imposto: valor,
        total_com_imposto: valor,
        pgt: dto.pgt ?? null,
        prazo: dto.prazo ?? null,
        local_entrega: dto.local_entrega ?? null,
        observacao: dto.observacao ?? null,
        tipo_faturamento: dto.tipo_faturamento ?? null,
      });
      const saved = await manager.save(order);
      return saved.uuid;
    });
    return this.findOne(uuid, user);
  }

  /** Espelha `update()` para pedido externo: sem itens, sem recálculo de totais por item. */
  async updateExternal(uuid: string, dto: UpdateExternalOrderDto, user: RequestUser): Promise<Order> {
    await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(Order);
      const order = await orderRepo.findOne({
        where: { uuid, tenant_id: user.tenantId, deleted_at: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException(`Pedido ${uuid} não encontrado.`);
      if (order.version !== dto.version) {
        throw new ConcurrentModificationException('order', uuid, dto.version, order.version);
      }
      if (this.isVendorOnly(user)) {
        const ownId = await this.resolveUuid(manager, 'usuarios', user.sub, user.tenantId, true);
        if (order.vendedor_id !== ownId) throw new NotFoundException(`Pedido ${uuid} não encontrado.`);
      }
      this.assertOrigem(order, 'externo');
      if (order.status !== 'em_aberto') {
        throw new ConflictException(`Pedido ${uuid} não pode ser editado pois não está em aberto.`);
      }

      const refs = await this.resolveHeader(manager, dto, user);
      await this.assertNumeroExternoLivre(
        manager, user.tenantId, refs.fornecedor_id!, dto.numero_pedido_externo.trim(), order.id,
      );
      const valor = money(dto.valor);
      // `status` e `origem` não são tocados: transição de status tem endpoint
      // próprio e a origem é imutável depois da criação.
      Object.assign(order, refs, {
        numero_pedido_externo: dto.numero_pedido_externo.trim(),
        sistema_origem: dto.sistema_origem.trim(),
        data: dto.data ?? null,
        pgt: dto.pgt ?? null,
        prazo: dto.prazo ?? null,
        local_entrega: dto.local_entrega ?? null,
        observacao: dto.observacao ?? null,
        tipo_faturamento: dto.tipo_faturamento ?? null,
        total_sem_imposto: valor,
        total_com_imposto: valor,
      });
      await orderRepo.save(order);
    });
    return this.findOne(uuid, user);
  }

  /**
   * Pedido interno e externo têm formas incompatíveis e cada um tem o seu
   * endpoint de edição. Sem esta guarda, um PUT /pedidos/:uuid num pedido
   * externo apagaria número de origem e sistema (o DTO interno não os tem) e
   * zeraria os totais — e um PUT /pedidos/externos/:uuid num pedido interno
   * sobrescreveria os totais calculados a partir dos itens.
   */
  private assertOrigem(order: Order, esperada: 'interno' | 'externo'): void {
    const atual = order.origem ?? 'interno';
    if (atual === esperada) return;
    throw new ConflictException(
      esperada === 'interno'
        ? 'Este é um pedido externo. Use PUT /pedidos/externos/:uuid para editá-lo.'
        : 'Este é um pedido interno. Use PUT /pedidos/:uuid para editá-lo.',
    );
  }

  async update(uuid: string, dto: UpdateOrderDto, user: RequestUser): Promise<Order> {
    await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(Order);
      const itemRepo = manager.getRepository(OrderItem);
      const order = await orderRepo.findOne({
        where: { uuid, tenant_id: user.tenantId, deleted_at: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException(`Pedido ${uuid} não encontrado.`);
      if (order.version !== dto.version) {
        throw new ConcurrentModificationException('order', uuid, dto.version, order.version);
      }
      if (this.isVendorOnly(user)) {
        const ownId = await this.resolveUuid(manager, 'usuarios', user.sub, user.tenantId, true);
        if (order.vendedor_id !== ownId) throw new NotFoundException(`Pedido ${uuid} não encontrado.`);
      }
      this.assertOrigem(order, 'interno');
      if (order.status !== 'em_aberto') {
        throw new ConflictException(`Pedido ${uuid} não pode ser editado pois não está em aberto.`);
      }

      const refs = await this.resolveHeader(manager, dto, user);
      const existingItems = await itemRepo.find({ withDeleted: true, where: { pedido_id: order.id, tenant_id: user.tenantId } });
      const byUuid = new Map(existingItems.map((item) => [item.uuid, item]));
      const requested = new Set(dto.itens.map((item) => item.uuid));
      const calculatedItems: Array<Partial<OrderItem>> = [];

      for (const itemDto of dto.itens) {
        const collisions = await manager.query(
          'SELECT tenant_id, pedido_id FROM itens_pedido WHERE uuid = $1 LIMIT 1',
          [itemDto.uuid],
        ) as Array<{ tenant_id: string; pedido_id: number }>;
        if (collisions[0] && (collisions[0].tenant_id !== user.tenantId || collisions[0].pedido_id !== order.id)) {
          throw new BadRequestException('UUID de item já pertence a outro pedido ou tenant.');
        }
        const values = await this.buildItem(manager, itemDto, user.tenantId, order.id, refs.fornecedor_id!);
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

      const totals = this.totalsFromItems(calculatedItems);
      // `status` não é tocado no update: a guarda acima só deixa editar pedido
      // 'em_aberto', e transição de status tem endpoint próprio.
      Object.assign(order, refs, {
        data: dto.data ?? null,
        pgt: dto.pgt ?? null,
        prazo: dto.prazo ?? null,
        local_entrega: dto.local_entrega ?? null,
        observacao: dto.observacao ?? null,
        tipo_faturamento: dto.tipo_faturamento ?? null,
        total_sem_imposto: totals.total_sem_imposto,
        total_com_imposto: totals.total_com_imposto,
      });
      await orderRepo.save(order);
    });
    return this.findOne(uuid, user);
  }

  async findAll(
    tenantId: string,
    pagination: PaginationDto,
    user: RequestUser,
    status?: string,
    search?: string,
    origem?: string,
  ): Promise<PaginatedResponse<Order>> {
    const { page = 1, limit = 20 } = pagination;
    const qb = this.orderRepo.createQueryBuilder('o')
      .leftJoinAndSelect('o.cliente', 'c')
      .where('o.tenant_id = :tenantId', { tenantId })
      .andWhere('o.deleted_at IS NULL');
    if (this.isVendorOnly(user)) {
      qb.andWhere(`o.${this.vendorOwnershipWhere(user).sql}`, this.vendorOwnershipWhere(user).params);
    }
    // Filtro inválido devolvia 200 com lista vazia: o operador conclui "não há
    // pedidos" quando o erro está no valor, e um front com typo falha em silêncio.
    if (status) {
      if (!(ORDER_STATUSES as readonly string[]).includes(status)) {
        throw new BadRequestException(`Status inválido. Use um de: ${ORDER_STATUSES.join(', ')}.`);
      }
      qb.andWhere('o.status = :status', { status });
    }
    if (origem) {
      if (!(ORDER_ORIGENS as readonly string[]).includes(origem)) {
        throw new BadRequestException(`Origem inválida. Use um de: ${ORDER_ORIGENS.join(', ')}.`);
      }
      qb.andWhere('o.origem = :origem', { origem });
    }
    if (search) {
      qb.andWhere(
        '(CAST(o.numero_pedido AS TEXT) ILIKE :search OR o.numero_pedido_externo ILIKE :search'
        + ' OR o.sistema_origem ILIKE :search OR c.razao_social ILIKE :search OR c.cnpj ILIKE :search)',
        { search: `%${search}%` },
      );
    }
    const [data, total] = await qb.orderBy('o.created_at', 'DESC')
      .skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(uuid: string, user: RequestUser): Promise<Order> {
    const qb = this.orderRepo.createQueryBuilder('o')
      .leftJoinAndSelect('o.cliente', 'cliente')
      .leftJoinAndSelect('cliente.transportadora', 'clienteTransportadora')
      .leftJoinAndSelect('o.transportadora', 'transportadora')
      .leftJoinAndSelect('o.fornecedor', 'fornecedor')
      .leftJoinAndSelect('o.vendedor', 'vendedor')
      .leftJoinAndSelect('o.itens', 'itens', 'itens.deleted_at IS NULL')
      .leftJoinAndSelect('itens.produto', 'produto')
      .where('o.uuid = :uuid', { uuid })
      .andWhere('o.tenant_id = :tenantId', { tenantId: user.tenantId })
      .andWhere('o.deleted_at IS NULL');
    if (this.isVendorOnly(user)) {
      const { sql, params } = this.vendorOwnershipWhere(user);
      qb.andWhere(`o.${sql}`, params);
    }
    const order = await qb.getOne();
    if (!order) throw new NotFoundException(`Pedido ${uuid} não encontrado.`);
    return order;
  }

  /**
   * Detalhe do pedido com as notas fiscais emitidas. O faturamento só devolve
   * o status para o pedido (ver FaturamentoService#recalculateOrderStatus); é
   * aqui que número, série, emissão e valor das notas voltam para a tela de
   * Pedidos — inclusive depois que o pedido sai da fila de faturamento.
   */
  async findOneDetalhe(uuid: string, user: RequestUser): Promise<OrderDetalhe> {
    const order = await this.findOne(uuid, user);

    const notas = await this.notaRepo.find({
      where: { pedido_id: order.id, tenant_id: user.tenantId, deleted_at: IsNull() },
      order: { data_emissao: 'DESC', created_at: 'DESC' },
    });

    const valorPedido = decimal(order.total_com_imposto ?? order.total_sem_imposto ?? 0);
    const totalFaturado = money(notas.reduce((acc, n) => acc.plus(decimal(n.valor)), decimal(0)));

    return {
      ...order,
      notas,
      total_faturado: totalFaturado,
      divergencia: money(valorPedido.minus(totalFaturado)),
    };
  }

  /**
   * Liberação vira endpoint dedicado (`liberar`); `parcialmente_faturado`/
   * `faturado` derivam exclusivamente do faturamento (nunca setados manualmente).
   * Único valor aceito aqui é 'cancelado' — e só quando não há notas fiscais
   * ativas vinculadas ao pedido.
   */
  async updateStatus(uuid: string, status: string, version: number, user: RequestUser): Promise<Order> {
    if (status !== 'cancelado') {
      throw new BadRequestException(
        "Transição de status inválida. Use PATCH /pedidos/:uuid/liberar para liberar o pedido; este endpoint só cancela.",
      );
    }

    const order = await this.findOne(uuid, user);

    if (await this.countNotasAtivas(user.tenantId, order.id) > 0) {
      throw new ConflictException('Pedido possui notas fiscais ativas e não pode ser cancelado.');
    }

    await optimisticUpdate({ repository: this.orderRepo, uuid, tenantId: user.tenantId,
      expectedVersion: version, resource: 'order', notFoundMessage: `Pedido ${uuid} não encontrado.`, patch: { status },
      extraWhere: this.isVendorOnly(user) ? this.vendorOwnershipWhere(user) : undefined });
    return this.findOne(uuid, user);
  }

  /** Libera o pedido para faturamento — só a partir de 'em_aberto'. */
  async liberar(uuid: string, version: number, user: RequestUser): Promise<Order> {
    const order = await this.findOne(uuid, user);
    if (order.status !== 'em_aberto') {
      throw new ConflictException('Pedido só pode ser liberado quando está em aberto.');
    }

    await optimisticUpdate({ repository: this.orderRepo, uuid, tenantId: user.tenantId,
      expectedVersion: version, resource: 'order', notFoundMessage: `Pedido ${uuid} não encontrado.`, patch: { status: 'liberado' },
      extraWhere: this.isVendorOnly(user) ? this.vendorOwnershipWhere(user) : undefined });
    return this.findOne(uuid, user);
  }

  /**
   * Notas fiscais ativas travam tanto cancelamento quanto exclusão: sem essa
   * guarda, o soft delete do pedido deixa nota e comissão vivas (`deleted_at
   * IS NULL`) somando no caixa, e ainda torna a nota impossível de corrigir —
   * `FaturamentoService` não acha mais o pedido dono dela.
   */
  private async countNotasAtivas(
    tenantId: string,
    orderId: number,
    // Quando a checagem faz parte de uma transação, contar por FORA dela abre
    // janela para uma nota emitida no intervalo passar despercebida.
    manager?: EntityManager,
  ): Promise<number> {
    return countNotasAtivas(manager ?? this.dataSource, tenantId, orderId);
  }

  /**
   * A transação fecha o TOCTOU entre a checagem de notas e o soft delete: sem
   * ela, uma nota emitida no intervalo passa despercebida.
   *
   * Já foi também o lugar da cascata para `pedido_fotos` (BACKLOG-0055). A
   * tabela deixou de existir na 0040 — a foto agora é do produto do catálogo,
   * não do pedido, e excluir um pedido não pode apagar foto de catálogo.
   */
  async remove(uuid: string, version: number, user: RequestUser): Promise<void> {
    const order = await this.findOne(uuid, user);

    await this.dataSource.transaction(async (manager) => {
      if (await this.countNotasAtivas(user.tenantId, order.id, manager) > 0) {
        throw new ConflictException(
          'Pedido possui notas fiscais ativas e não pode ser excluído. Exclua as notas fiscais primeiro.',
        );
      }

      await optimisticSoftDelete({ repository: manager.getRepository(Order), uuid, tenantId: user.tenantId,
        expectedVersion: version, resource: 'order', notFoundMessage: `Pedido ${uuid} não encontrado.`,
        extraWhere: this.isVendorOnly(user) ? this.vendorOwnershipWhere(user) : undefined });

      // Depois do pai, no mesmo molde do SAC (BACKLOG-0055): conflito de
      // `version` aborta a transação e nenhum item fica marcado sem o pedido.
      // Sem esta cascata o item sobrevive com `deleted_at IS NULL` e só fica
      // escondido porque toda query o alcança através do pedido — convenção,
      // não mecanismo. O banco de dev tinha 81 desses quando o gap foi achado
      // (BACKLOG-0080).
      await manager.query(
        `UPDATE itens_pedido SET deleted_at = CURRENT_TIMESTAMP, version = version + 1
          WHERE tenant_id = $1 AND pedido_id = $2 AND deleted_at IS NULL`,
        [user.tenantId, order.id],
      );
    });
  }
}
